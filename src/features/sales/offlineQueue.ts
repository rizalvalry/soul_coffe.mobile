import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, request, uuidv4 } from '@/lib/api';
import { DAY_NOT_OPEN_MESSAGE, RIDER_ABSEN_MESSAGE, isDayNotOpen, riderDayGate, riderGateMessage } from '@/features/showcase/riderDayGate';
import type { AttendanceStatus, Sale } from '@/domain/types';
import type { RecordSaleInput } from './queries';
import { useAuth } from '@/features/auth/store';

/**
 * The offline queue for penjualan gerobak.
 *
 * WHY THIS EXISTS
 * ---------------
 * A cart trading in a dead-signal pocket — a basement mall, the edge of a park — could not record
 * a single sale before this: `useRecordSale()` threw the instant `fetch` failed, and the only
 * option was to remember the sale in someone's head until the phone found a bar of signal again.
 * That is exactly the kind of gap that makes a POS go unused in favour of a paper notebook.
 *
 * WHAT MAKES REPLAYING A QUEUED SALE SAFE
 * -----------------------------------------
 * Every sale already carries a client-generated `uuid` used as both the request body's own field
 * and the `Idempotency-Key` header (R14) — the server returns the existing sale rather than
 * selling the same cups twice on a retry. Queuing simply delays that same request; nothing about
 * the safety property changes because the delay is minutes instead of milliseconds.
 *
 * WHAT HAPPENS TO A QUEUED SALE THE SERVER GENUINELY REJECTS
 * --------------------------------------------------------------
 * A transport failure (no connection at all) leaves an entry queued for the next attempt. A real
 * rejection such as an assignment change or insufficient stock stays in the owner's local record
 * with the server's reason and is skipped on replay. A closed day or missing attendance is
 * temporary: the entry stays pending until the Rider can transact again.
 */

const LEGACY_STORAGE_KEY = 'soul.sales.offline_queue.v1';
const STORAGE_KEY_PREFIX = 'soul.sales.offline_queue.v2.';

function storageKey(ownerId: string): string {
  if (!ownerId) throw new Error('Pemilik antrean penjualan tidak diketahui.');
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(ownerId)}`;
}

function isCurrentOwner(ownerId: string): boolean {
  return useAuth.getState().session?.user.id === ownerId;
}

/** One sale waiting to be sent. */
export type QueuedSale = {
  uuid: string;
  queuedAt: string;
  input: RecordSaleInput;
  /** A server rejection remains on this account's device until explicitly resolved. */
  rejection?: string;
};

/** What one flush attempt actually did, so the caller can tell the two outcomes apart. */
export type FlushResult = {
  synced: Sale[];
  failed: { entry: QueuedSale; message: string }[];
  /** A closed day or missing attendance is temporary; keep the sale pending. */
  waitingForGate: string | null;
  /** True when a transport failure stopped the flush early — there was still no connection. */
  stillOffline: boolean;
};

/** The exact request body `POST /sales` expects, shared with the online path in queries.ts so
 *  queuing an entry and sending it immediately build the identical payload. */
export function buildSaleBody(uuid: string, input: RecordSaleInput): Record<string, unknown> {
  return {
    uuid,
    lines: input.lines.filter((line) => line.qty > 0),
    payment_method: input.paymentMethod,
    ...(input.gps
      ? { gps_lat: input.gps.lat, gps_lng: input.gps.lng }
      : // E10: a lost fix is reported as missing, never a reason to refuse the sale.
        { gps_unavailable: true }),
    ...(input.note ? { note: input.note } : {}),
    ...(input.deviceId ? { device_id: input.deviceId } : {}),
  };
}

async function readQueue(ownerId: string): Promise<QueuedSale[]> {
  const raw = await AsyncStorage.getItem(storageKey(ownerId));
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Antrean offline rusak; data lama tetap disimpan.');
  return parsed as QueuedSale[];
}

async function writeQueue(ownerId: string, queue: QueuedSale[]): Promise<void> {
  // A failed write must be visible to the caller; claiming a sale is queued when it was not
  // persisted would silently lose a transaction on the next app launch.
  await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(queue));
}

const pendingWrites = new Map<string, Promise<void>>();

/** Serialize local edits; a flush must merge into the latest queue after its network await. */
async function updateQueue(ownerId: string, change: (queue: QueuedSale[]) => QueuedSale[]): Promise<void> {
  const previous = pendingWrites.get(ownerId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const queue = await readQueue(ownerId);
    await writeQueue(ownerId, change(queue));
  });
  pendingWrites.set(ownerId, next);
  try {
    await next;
  } finally {
    if (pendingWrites.get(ownerId) === next) pendingWrites.delete(ownerId);
  }
}

export async function loadQueuedSales(ownerId: string): Promise<QueuedSale[]> {
  return readQueue(ownerId);
}

/** V1 entries have no owner field. Keep them untouched and never replay them under a guess. */
export async function legacyQueuedSaleCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    // The legacy blob still exists. Surface a warning even if its count cannot be decoded.
    return 1;
  }
}

/** Appends one sale to the queue and persists it. Returns the entry, so the caller can show it. */
export async function enqueueSale(ownerId: string, input: RecordSaleInput): Promise<QueuedSale> {
  if (!isCurrentOwner(ownerId)) throw new Error('Sesi berubah. Penjualan belum disimpan; masuk kembali.');
  const entry: QueuedSale = { uuid: input.uuid ?? uuidv4(), queuedAt: new Date().toISOString(), input };

  await updateQueue(ownerId, (queue) => {
    if (!isCurrentOwner(ownerId)) throw new Error('Sesi berubah. Penjualan belum disimpan; masuk kembali.');
    return [...queue, entry];
  });

  return entry;
}

export async function removeQueuedSale(ownerId: string, uuid: string): Promise<void> {
  await updateQueue(ownerId, (queue) => queue.filter((entry) => entry.uuid !== uuid));
}

/**
 * Attempts every queued sale, oldest first — the order they would have gone out in had the
 * connection never dropped.
 *
 * Stops at the first TRANSPORT failure (no response at all) rather than racing through every
 * remaining entry against a connection that has already proven itself dead this round; the next
 * trigger (a network-state change, the next screen focus) tries again from where this left off.
 * A REJECTION (a real HTTP error) does not stop the flush — that entry is retained with its
 * reason, and every entry after it still gets its own chance.
 */
export async function flushSalesQueue(ownerId: string): Promise<FlushResult> {
  const queue = await readQueue(ownerId);
  const synced: Sale[] = [];
  const failed: { entry: QueuedSale; message: string }[] = [];
  let stillOffline = false;
  let waitingForGate: string | null = null;

  const syncedIds = new Set<string>();
  const rejected = new Map<string, string>();

  for (const entry of queue) {
    if (entry.rejection) continue;
    // A queued sale must never be sent using the next person's bearer token.
    if (!isCurrentOwner(ownerId)) break;
    try {
      const sale = await request<Sale>('/sales', {
        method: 'POST',
        // The SAME uuid the entry was queued under, both here and in the body — a queued sale
        // flushed twice by two overlapping triggers must still only ever sell its cups once.
        idempotencyKey: entry.uuid,
        body: buildSaleBody(entry.uuid, entry.input),
      });

      synced.push(sale);
      syncedIds.add(entry.uuid);
    } catch (e) {
      // Never query another account's attendance after a sign-out during this request.
      if (!isCurrentOwner(ownerId) || (e instanceof ApiError && (e.isOffline || e.status === 401))) {
        stillOffline = true;
        break;
      }
      if (isDayNotOpen(e)) {
        waitingForGate = DAY_NOT_OPEN_MESSAGE;
        break;
      }
      if (e instanceof ApiError && e.status === 422) {
        try {
          // The attendance refusal has no stable error code. Check current server status before
          // treating any 422 as permanent, so a stale cached shift cannot strand an offline sale.
          const status = await request<AttendanceStatus>('/absen/status');
          const gate = riderDayGate(status);
          if (gate === 'closed' || gate === 'attendance' || (gate === 'legacy' && !status.has_clocked_in)) {
            waitingForGate = riderGateMessage(gate) ?? RIDER_ABSEN_MESSAGE;
            break;
          }
        } catch {
          // If status cannot be checked, keeping the sale is safer than losing its retry path.
          waitingForGate = e.message;
          break;
        }
      }
      // Preserve the rejected transaction and its reason for this account after the screen
      // unmounts or the phone changes hands. It is no longer retried automatically.
      const message = e instanceof ApiError ? e.message : 'Gagal mengirim transaksi.';
      failed.push({ entry, message });
      rejected.set(entry.uuid, message);
    }
  }

  await updateQueue(ownerId, (latest) => latest
    .filter((entry) => !syncedIds.has(entry.uuid))
    .map((entry) => rejected.has(entry.uuid)
      ? { ...entry, rejection: rejected.get(entry.uuid) }
      : entry));

  return { synced, failed, stillOffline, waitingForGate };
}

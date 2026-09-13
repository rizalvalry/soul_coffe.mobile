import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, request, uuidv4 } from '@/lib/api';
import type { Sale } from '@/domain/types';
import type { RecordSaleInput } from './queries';

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
 * rejection — the absen window closed, the cart's assignment changed, the stock no longer covers
 * it — is different: replaying it forever would never succeed, and silently dropping it would
 * lose the staff member's record of having tried to sell those cups with no trace. So a rejected
 * entry is removed from the retry queue but reported back to the caller as `failed`, with the
 * server's own message, so the screen can tell the staff member plainly rather than have the
 * queue quietly shrink for a reason nobody saw.
 */

const STORAGE_KEY = 'soul.sales.offline_queue.v1';

/** One sale waiting to be sent. */
export type QueuedSale = {
  uuid: string;
  queuedAt: string;
  input: RecordSaleInput;
};

/** What one flush attempt actually did, so the caller can tell the two outcomes apart. */
export type FlushResult = {
  synced: Sale[];
  failed: { entry: QueuedSale; message: string }[];
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

async function readQueue(): Promise<QueuedSale[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedSale[]) : [];
  } catch {
    // A corrupted local queue must never crash the till — treat it as empty. Whatever was in it
    // is unrecoverable, but the app keeps working for the next sale.
    return [];
  }
}

async function writeQueue(queue: QueuedSale[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Best-effort. A failed write here means the queue is not durable across an app kill, which
    // is a smaller loss than failing the sale the staff member just recorded.
  }
}

export async function loadQueuedSales(): Promise<QueuedSale[]> {
  return readQueue();
}

/** Appends one sale to the queue and persists it. Returns the entry, so the caller can show it. */
export async function enqueueSale(input: RecordSaleInput): Promise<QueuedSale> {
  const entry: QueuedSale = { uuid: uuidv4(), queuedAt: new Date().toISOString(), input };

  const queue = await readQueue();
  queue.push(entry);
  await writeQueue(queue);

  return entry;
}

export async function removeQueuedSale(uuid: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((entry) => entry.uuid !== uuid));
}

/**
 * Attempts every queued sale, oldest first — the order they would have gone out in had the
 * connection never dropped.
 *
 * Stops at the first TRANSPORT failure (no response at all) rather than racing through every
 * remaining entry against a connection that has already proven itself dead this round; the next
 * trigger (a network-state change, the next screen focus) tries again from where this left off.
 * A REJECTION (a real HTTP error) does not stop the flush — that entry is dropped from the queue
 * and every entry after it still gets its own chance.
 */
export async function flushSalesQueue(): Promise<FlushResult> {
  const queue = await readQueue();
  const synced: Sale[] = [];
  const failed: { entry: QueuedSale; message: string }[] = [];
  let stillOffline = false;

  const remaining = [...queue];

  for (const entry of queue) {
    try {
      const sale = await request<Sale>('/sales', {
        method: 'POST',
        // The SAME uuid the entry was queued under, both here and in the body — a queued sale
        // flushed twice by two overlapping triggers must still only ever sell its cups once.
        idempotencyKey: entry.uuid,
        body: buildSaleBody(entry.uuid, entry.input),
      });

      synced.push(sale);
      const index = remaining.findIndex((row) => row.uuid === entry.uuid);
      if (index >= 0) remaining.splice(index, 1);
    } catch (e) {
      if (e instanceof ApiError && e.isOffline) {
        stillOffline = true;
        break;
      }

      // A genuine rejection: keep it out of the retry loop, but tell the caller exactly what the
      // server said rather than letting the entry vanish with no explanation.
      failed.push({ entry, message: e instanceof ApiError ? e.message : 'Gagal mengirim transaksi.' });
      const index = remaining.findIndex((row) => row.uuid === entry.uuid);
      if (index >= 0) remaining.splice(index, 1);
    }
  }

  await writeQueue(remaining);

  return { synced, failed, stillOffline };
}

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { request, requestWithStatus, uploadFile, uploadFileWithStatus, uuidv4 } from '@/lib/api';
import { compressForUpload } from '@/lib/image';
import {
  toAppNotification,
  toRefillRequest,
  toStockRow,
  type RawAppNotification,
  type RawRefillRequest,
  type RawStockRow,
} from '@/lib/mappers';
import type { AppNotification, BadgeCounts, Product, RefillRequest, RefillStatus, StaffOnShift } from '@/domain/types';

/**
 * Neither `RefillLineResource` nor `StockRowResource` (soul_coffe.backend) return a product's
 * `unit` — the only place it lives is the `/products` master-data list, already cached under
 * `qk.products` by `useProducts()`. `ensureQueryData` reuses that cache when fresh instead of
 * issuing a second request, and populates it for `useProducts()` if this happens to be the
 * first thing on screen to ask for it. Falls back to a blank unit rather than failing the
 * whole refill/stock query over a label if `/products` itself is unreachable.
 */
async function unitLookup(client: QueryClient): Promise<(productId: number) => string> {
  try {
    const products = await client.ensureQueryData({
      queryKey: qk.products,
      queryFn: () => request<Product[]>('/products'),
      staleTime: 10 * 60_000,
    });
    const byId = new Map(products.map((p) => [p.id, p.unit]));
    return (productId) => byId.get(productId) ?? '';
  } catch {
    return () => '';
  }
}

/**
 * Query keys are declared in one place so realtime invalidation cannot drift from the keys the
 * screens actually use — a mismatch there produces a UI that silently stops updating.
 */
export const qk = {
  products: ['products'] as const,
  badges: ['badges'] as const,
  notifications: ['notifications'] as const,
  refills: (params?: { status?: RefillStatus | RefillStatus[] }) => ['refills', params ?? {}] as const,
  refill: (id: number) => ['refill', id] as const,
  // Still here because `useStaffOnShift()` reads it for the barista's history screen. The
  // allocation WRITE hook and the staff's read-only allocation hook were removed on 2026-09-10
  // along with their screens — see features/navigation/menu.ts for why that step no longer
  // exists in the flow.
  allocationsToday: ['allocations', 'today'] as const,
  myStock: ['me', 'stock'] as const,
  kitchenStock: ['kitchen', 'stock'] as const,
};

function statusParam(status?: RefillStatus | RefillStatus[]): string {
  if (!status) return '';
  return `?status=${Array.isArray(status) ? status.join(',') : status}`;
}

/** Called by the realtime layer on every inbound event, and by the polling fallback. */
export function invalidateRefillData(client: QueryClient, refillId?: number) {
  void client.invalidateQueries({ queryKey: ['refills'] });
  void client.invalidateQueries({ queryKey: qk.badges });
  void client.invalidateQueries({ queryKey: qk.notifications });
  if (refillId) void client.invalidateQueries({ queryKey: qk.refill(refillId) });
}

// ── Reads ────────────────────────────────────────────────────────────────────

export function useProducts() {
  return useQuery({
    queryKey: qk.products,
    queryFn: () => request<Product[]>('/products'),
    staleTime: 10 * 60_000, // master data; the menu changes rarely
  });
}

export function useBadges() {
  return useQuery({
    queryKey: qk.badges,
    queryFn: () => request<BadgeCounts>('/badges'),
  });
}

/**
 * `unreadOnly` is a separate cache entry from the full inbox, not a client-side filter of one
 * shared list: the bell's badge count needs to be cheap and correct even when the inbox itself
 * has never been opened this session, and a single shared query would force the badge to fetch
 * every read notification just to count the unread ones.
 */
export function useNotifications(options?: { unreadOnly?: boolean }) {
  const unreadOnly = options?.unreadOnly ?? false;
  return useQuery({
    queryKey: [...qk.notifications, { unreadOnly }] as const,
    queryFn: async () => {
      const rows = await request<RawAppNotification[]>(`/notifications${unreadOnly ? '?unread=1' : ''}`);
      return rows.map(toAppNotification);
    },
  });
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: number) => request<void>(`/notifications/${notificationId}/read`, { method: 'POST' }),
    // Both cache entries above key off `qk.notifications`, so one invalidation call — using the
    // short, unparameterised key — reaches the inbox screen AND the bell's unread count together.
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.notifications }),
  });
}

/**
 * Clears the badge the instant it's tapped, not after the request round-trips.
 *
 * A bell that has piled up unread items is exactly the case where a spinner or a laggy count is
 * most visible and most annoying — the whole point of "tandai semua dibaca" is that the number
 * disappears NOW. `onMutate` writes both cache entries directly (the unread list to empty, the
 * full inbox's rows stamped read) before the request is even sent; `onError` restores the
 * snapshot if the server disagrees, and `onSettled` refetches so the cache still converges on
 * whatever the server actually recorded.
 */
export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request<void>('/notifications/read-all', { method: 'POST' }),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: qk.notifications });

      const previous = client.getQueriesData<AppNotification[]>({ queryKey: qk.notifications });
      const now = new Date().toISOString();

      for (const [key] of previous) {
        client.setQueryData<AppNotification[]>(key, (rows) => {
          if (!rows) return rows;
          const isUnreadOnlyKey = (key[1] as { unreadOnly?: boolean } | undefined)?.unreadOnly === true;
          return isUnreadOnlyKey ? [] : rows.map((n) => (n.read_at ? n : { ...n, read_at: now }));
        });
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) {
        client.setQueryData(key, data);
      }
    },
    onSettled: () => void client.invalidateQueries({ queryKey: qk.notifications }),
  });
}

export function useRefills(status?: RefillStatus | RefillStatus[]) {
  const client = useQueryClient();
  return useQuery({
    queryKey: qk.refills({ ...(status ? { status } : {}) }),
    queryFn: async () => {
      const [rows, unitOf] = await Promise.all([
        request<RawRefillRequest[]>(`/refills${statusParam(status)}`),
        unitLookup(client),
      ]);
      return rows.map((r) => toRefillRequest(r, unitOf));
    },
  });
}

export function useRefill(id: number) {
  const client = useQueryClient();
  return useQuery({
    queryKey: qk.refill(id),
    queryFn: async () => {
      const [raw, unitOf] = await Promise.all([
        request<RawRefillRequest>(`/refills/${id}`),
        unitLookup(client),
      ]);
      return toRefillRequest(raw, unitOf);
    },
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useStaffOnShift() {
  return useQuery({
    queryKey: qk.allocationsToday,
    queryFn: () => request<StaffOnShift[]>('/allocations/today'),
  });
}

export function useMyStock() {
  const client = useQueryClient();
  return useQuery({
    queryKey: qk.myStock,
    queryFn: async () => {
      const [rows, unitOf] = await Promise.all([
        request<RawStockRow[]>('/me/stock'),
        unitLookup(client),
      ]);
      return rows.map((r) => toStockRow(r, unitOf));
    },
  });
}

export function useKitchenStock() {
  const client = useQueryClient();
  return useQuery({
    queryKey: qk.kitchenStock,
    queryFn: async () => {
      const [rows, unitOf] = await Promise.all([
        request<RawStockRow[]>('/kitchen/stock'),
        unitLookup(client),
      ]);
      return rows.map((r) => toStockRow(r, unitOf));
    },
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Every mutation below generates its own Idempotency-Key (R12).
 *
 * The key is created once per mutation *call*, not per retry, which is the whole point: a
 * retried or double-tapped submit reuses the same key and the server replays the original
 * response instead of creating a second record.
 */

export type UploadEvidenceInput = {
  uri: string;
  takenAt: string;
};

/**
 * Compression lives inside the mutation, not in the screen, so no future caller can reach
 * `/media/evidence` with a raw multi-megabyte camera frame by forgetting a step — see
 * `lib/image.ts` for why the size of that frame is the problem.
 */
export function useUploadEvidence() {
  return useMutation({
    mutationFn: async (input: UploadEvidenceInput) => {
      const compressed = await compressForUpload(input.uri);
      return uploadFile<{ id: number; url: string }>(
        '/media/evidence',
        { uri: compressed.uri, name: 'evidence.jpg', type: 'image/jpeg' },
        { taken_at: input.takenAt },
      );
    },
  });
}

/**
 * The rider's handover photo, uploaded just before the delivery it belongs to.
 *
 * Separate request, same reason the evidence photo is separate: a delivery may also carry a
 * signature, and `uploadFileWithStatus` streams exactly one file per request on purpose (see its
 * docblock for the cellular failure that forced that). So the required photo goes first and the
 * delivery references it by id.
 */
export function useUploadHandoverPhoto() {
  return useMutation({
    mutationFn: async (input: UploadEvidenceInput) => {
      const compressed = await compressForUpload(input.uri);
      return uploadFile<{ id: number; url: string }>(
        '/media/handover',
        { uri: compressed.uri, name: 'handover.jpg', type: 'image/jpeg' },
        { taken_at: input.takenAt },
      );
    },
  });
}

export type SubmitRefillInput = {
  cartId: number;
  evidenceMediaId: number;
  gps: { lat: number; lng: number } | null;
  lines: { product_id: number; qty_requested: number }[];
};

export function useSubmitRefill() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitRefillInput) => {
      const [raw, unitOf] = await Promise.all([
        request<RawRefillRequest>('/refills', {
          method: 'POST',
          idempotencyKey: uuidv4(),
          body: {
            uuid: uuidv4(),
            cart_id: input.cartId,
            evidence_media_id: input.evidenceMediaId,
            gps_lat: input.gps?.lat ?? null,
            gps_lng: input.gps?.lng ?? null,
            gps_unavailable: input.gps === null,
            client_submitted_at: new Date().toISOString(),
            lines: input.lines,
          },
        }),
        unitLookup(client),
      ]);
      return toRefillRequest(raw, unitOf);
    },
    onSuccess: () => invalidateRefillData(client),
  });
}

function useTransition<TInput>(
  buildPath: (input: TInput) => string,
  buildBody?: (input: TInput) => unknown,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) => {
      const [raw, unitOf] = await Promise.all([
        request<RawRefillRequest>(buildPath(input), {
          method: 'POST',
          idempotencyKey: uuidv4(),
          ...(buildBody ? { body: buildBody(input) } : {}),
        }),
        unitLookup(client),
      ]);
      return toRefillRequest(raw, unitOf);
    },
    onSuccess: (data) => invalidateRefillData(client, data?.id),
  });
}

export const useApproveRefill = () =>
  useTransition<{
    id: number;
    lines: { line_id: number; qty_approved: number }[];
    partialReason?: string;
  }>(
    (i) => `/refills/${i.id}/approve`,
    (i) => ({
      lines: i.lines,
      ...(i.partialReason ? { partial_reason: i.partialReason } : {}),
    }),
  );

export const useRejectRefill = () =>
  useTransition<{ id: number; reason: string }>(
    (i) => `/refills/${i.id}/reject`,
    (i) => ({ reason: i.reason }),
  );

export const useCancelRefill = () =>
  useTransition<{ id: number }>((i) => `/refills/${i.id}/cancel`);

/** The R1 gate. A `409` here is the server correctly refusing an unapproved request. */
export const useStartPreparing = () =>
  useTransition<{ id: number }>((i) => `/refills/${i.id}/start-preparing`);

export const useMarkReady = () =>
  useTransition<{
    id: number;
    lines: { line_id: number; qty_prepared: number }[];
    shortfallReason?: string;
  }>(
    (i) => `/refills/${i.id}/ready`,
    (i) => ({
      lines: i.lines,
      ...(i.shortfallReason ? { shortfall_reason: i.shortfallReason } : {}),
    }),
  );

/** Atomic claim. The losing rider gets `409` (E2). */
export const useClaimRefill = () =>
  useTransition<{ id: number }>((i) => `/refills/${i.id}/claim`);

export type DeliverInput = {
  id: number;
  /** Required (2026-09-10): the photo of the cups changing hands, already uploaded. */
  handoverMediaId: number;
  lines: { line_id: number; qty_received: number }[];
  gps: { lat: number; lng: number } | null;
  /**
   * Optional now. Three shapes reach the server, all legitimate:
   *   nothing here            — photo only, which is the normal case;
   *   method staff_signature  — with a signature file and its stroke count (E24);
   *   method pin_fallback     — with the staff member's PIN and no file at all (E7).
   */
  signature?:
    | { method: 'staff_signature'; uri: string; strokeCount: number }
    | { method: 'pin_fallback'; staffPin: string };
};

export type DeliverResult = {
  refill: RefillRequest | null;
  /** True when the server answered 202: delivery recorded, ledger post being retried (E19). */
  ledgerPending: boolean;
};

export function useDeliverRefill() {
  const client = useQueryClient();
  return useMutation<DeliverResult, Error, DeliverInput>({
    mutationFn: async (input: DeliverInput) => {
      const signature = input.signature;

      // Shared by both paths below. Everything except the signature file is ordinary data, so
      // the two branches differ only in HOW they travel, never in what is sent.
      const body = {
        handover_media_id: input.handoverMediaId,
        lines: input.lines,
        gps_lat: input.gps ? input.gps.lat : null,
        gps_lng: input.gps ? input.gps.lng : null,
        // E10: a lost fix is reported as missing, never a reason to refuse the delivery.
        gps_unavailable: input.gps === null,
        ...(signature?.method === 'staff_signature' ? { signature_method: 'staff_signature', stroke_count: signature.strokeCount } : {}),
        ...(signature?.method === 'pin_fallback' ? { signature_method: 'pin_fallback', staff_pin: signature.staffPin } : {}),
      };

      // `/deliver` carries `idempotent:require`; without this header the server answers 422
      // "Header Idempotency-Key wajib dikirim untuk aksi ini." before the handler ever runs.
      const idempotencyKey = uuidv4();

      const [result, unitOf] = await Promise.all([
        signature?.method === 'staff_signature'
          ? uploadFileWithStatus<RawRefillRequest | null>(
              `/refills/${input.id}/deliver`,
              { uri: signature.uri, name: 'signature.png', type: 'image/png' },
              {
                // Multipart carries strings; the server casts. `lines` is JSON for the same
                // reason it is on the incident endpoint — multipart has no array-of-objects
                // encoding this client can rely on.
                handover_media_id: String(input.handoverMediaId),
                signature_method: 'staff_signature',
                stroke_count: String(signature.strokeCount),
                lines: JSON.stringify(input.lines),
                gps_lat: input.gps ? String(input.gps.lat) : '',
                gps_lng: input.gps ? String(input.gps.lng) : '',
                gps_unavailable: input.gps === null ? '1' : '0',
              },
              // The deliver endpoint names this part `signature`, not `file` (docs/04).
              'signature',
              idempotencyKey,
            )
          : // No file to send: a photo-only delivery, or a PIN fallback that no longer needs the
            // 1x1 placeholder image an older build had to invent.
            requestWithStatus<RawRefillRequest | null>(`/refills/${input.id}/deliver`, {
              method: 'POST',
              idempotencyKey,
              body,
            }),
        unitLookup(client),
      ]);

      return {
        refill: result.data ? toRefillRequest(result.data, unitOf) : null,
        ledgerPending: result.status === 202,
      };
    },
    onSuccess: (result) => invalidateRefillData(client, result.refill?.id),
  });
}


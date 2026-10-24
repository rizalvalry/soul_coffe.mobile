import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { request, requestWithStatus, uploadFile, uploadFileWithStatus, uuidv4 } from '@/lib/api';
import { compressForUpload } from '@/lib/image';
import { useKitchenSelection } from '@/features/showcase/kitchenSelection';
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

/** Called by the realtime layer on inbound events and by the push listener. */
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
    queryFn: async () => (await request<Product[]>('/products')).filter((product) => product.is_sellable),
    // A CMS photo may change between visits; refetch on mount without a timer or polling.
    staleTime: 0,
    refetchOnMount: 'always',
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

export function useRefills(status?: RefillStatus | RefillStatus[], kitchen = false) {
  const client = useQueryClient();
  const kitchenId = useKitchenSelection((s) => s.kitchenId);
  return useQuery({
    queryKey: qk.refills({ ...(status ? { status } : {}), ...(kitchen ? { kitchenId } : {}) }),
    queryFn: async () => {
      const [rows, unitOf] = await Promise.all([
        request<RawRefillRequest[]>(`/refills${statusParam(status)}`, { kitchen }),
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
  const kitchenId = useKitchenSelection((s) => s.kitchenId);
  return useQuery({
    queryKey: [...qk.allocationsToday, kitchenId],
    queryFn: () => request<StaffOnShift[]>('/allocations/today', { kitchen: true }),
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
  const kitchenId = useKitchenSelection((s) => s.kitchenId);
  return useQuery({
    queryKey: [...qk.kitchenStock, kitchenId],
    queryFn: async () => {
      const [rows, unitOf] = await Promise.all([
        request<RawStockRow[]>('/kitchen/stock', { kitchen: true }),
        unitLookup(client),
      ]);
      return rows.map((r) => toStockRow(r, unitOf));
    },
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * A failed mutation keeps its attempt in the mounted form. Repeating the same action replays
 * the same request; success clears it, and closing the form unmounts its attempt.
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
  note?: string;
};

function submitAttemptId(input: SubmitRefillInput): string {
  // GPS can arrive after a timeout. It is evidence, not a form edit; keep the first body intact.
  return JSON.stringify([input.cartId, input.evidenceMediaId, input.lines, input.note || null]);
}

export function useSubmitRefill() {
  const client = useQueryClient();
  const attempt = useRef<{ identity: string; key: string; body: unknown } | null>(null);
  return useMutation({
    mutationFn: async (input: SubmitRefillInput) => {
      const identity = submitAttemptId(input);
      if (attempt.current?.identity !== identity) {
        const key = uuidv4();
        attempt.current = {
          identity,
          key,
          body: {
            uuid: key,
            cart_id: input.cartId,
            evidence_media_id: input.evidenceMediaId,
            gps_lat: input.gps?.lat ?? null,
            gps_lng: input.gps?.lng ?? null,
            gps_unavailable: input.gps === null,
            client_submitted_at: new Date().toISOString(),
            lines: input.lines.map((line) => ({ ...line })),
            note: input.note || null,
          },
        };
      }
      const current = attempt.current;
      const [raw, unitOf] = await Promise.all([
        request<RawRefillRequest>('/refills', {
          method: 'POST',
          idempotencyKey: current.key,
          body: current.body,
        }),
        unitLookup(client),
      ]);
      return toRefillRequest(raw, unitOf);
    },
    onSuccess: (_data, input) => {
      if (attempt.current?.identity === submitAttemptId(input)) attempt.current = null;
      invalidateRefillData(client);
    },
  });
}

function useTransition<TInput extends object>(
  buildPath: (input: TInput) => string,
  buildBody?: (input: TInput) => unknown,
  kitchen = false,
) {
  const client = useQueryClient();
  const attempts = useRef(new Map<string, { key: string; inFlight: number; failed: boolean }>());
  return useMutation({
    mutationFn: async (input: TInput) => {
      const path = buildPath(input);
      const body = buildBody?.(input);
      // requestWithStatus adds kitchen_id to management writes. Capture the selected kitchen
      // before choosing a key so a later selection change cannot reuse it with a new wire body.
      const kitchenId = kitchen ? useKitchenSelection.getState().kitchenId : null;
      const identity = JSON.stringify([path, body ?? null, kitchenId]);
      let attempt = attempts.current.get(identity);
      if (!attempt) {
        attempt = { key: uuidv4(), inFlight: 0, failed: false };
        attempts.current.set(identity, attempt);
      }
      if (attempt.inFlight === 0) attempt.failed = false;
      attempt.inFlight += 1;
      try {
        const [raw, unitOf] = await Promise.all([
          request<RawRefillRequest>(path, {
            kitchen,
            ...(kitchenId ? { kitchenId } : {}),
            method: 'POST',
            idempotencyKey: attempt.key,
            ...(buildBody ? { body } : {}),
          }),
          unitLookup(client),
        ]);
        return toRefillRequest(raw, unitOf);
      } catch (error) {
        attempt.failed = true;
        throw error;
      } finally {
        attempt.inFlight -= 1;
        if (attempt.inFlight === 0 && !attempt.failed && attempts.current.get(identity) === attempt) {
          attempts.current.delete(identity);
        }
      }
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
  useTransition<{ id: number }>((i) => `/refills/${i.id}/start-preparing`, undefined, true);

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
    true,
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

function deliveryAttemptId(input: DeliverInput): string {
  // Keep the original GPS in the wire body even if a fix arrives before a retry.
  return JSON.stringify([input.id, input.handoverMediaId, input.lines, input.signature ?? null]);
}

export function useDeliverRefill() {
  const client = useQueryClient();
  const attempts = useRef(new Map<string, {
    key: string;
    path: string;
    body: {
      handover_media_id: number;
      lines: DeliverInput['lines'];
      gps_lat: number | null;
      gps_lng: number | null;
      gps_unavailable: boolean;
      signature_method?: 'staff_signature' | 'pin_fallback';
      stroke_count?: number;
      staff_pin?: string;
    };
    signature?: DeliverInput['signature'];
  }>());
  return useMutation<DeliverResult, Error, DeliverInput>({
    mutationFn: async (input: DeliverInput) => {
      const identity = deliveryAttemptId(input);
      let attempt = attempts.current.get(identity);
      if (!attempt) {
        const signature = input.signature ? { ...input.signature } : undefined;
        attempt = {
          key: uuidv4(),
          path: `/refills/${input.id}/deliver`,
          signature,
          // Shared by both paths below. Save every field before the first network call.
          body: {
            handover_media_id: input.handoverMediaId,
            lines: input.lines.map((line) => ({ ...line })),
            gps_lat: input.gps?.lat ?? null,
            gps_lng: input.gps?.lng ?? null,
            // E10: a lost fix is evidence, never a reason to refuse delivery.
            gps_unavailable: input.gps === null,
            ...(signature?.method === 'staff_signature' ? { signature_method: 'staff_signature' as const, stroke_count: signature.strokeCount } : {}),
            ...(signature?.method === 'pin_fallback' ? { signature_method: 'pin_fallback' as const, staff_pin: signature.staffPin } : {}),
          },
        };
        attempts.current.set(identity, attempt);
      }
      const { body, signature } = attempt;

      // `/deliver` carries `idempotent:require`; without this header the server answers 422
      // "Header Idempotency-Key wajib dikirim untuk aksi ini." before the handler ever runs.
      const [result, unitOf] = await Promise.all([
        signature?.method === 'staff_signature'
          ? uploadFileWithStatus<RawRefillRequest | null>(
              attempt.path,
              { uri: signature.uri, name: 'signature.png', type: 'image/png' },
              {
                // Multipart carries strings; the server casts. `lines` is JSON for the same
                // reason it is on the incident endpoint — multipart has no array-of-objects
                // encoding this client can rely on.
                handover_media_id: String(body.handover_media_id),
                signature_method: 'staff_signature',
                stroke_count: String(signature.strokeCount),
                lines: JSON.stringify(body.lines),
                gps_lat: body.gps_lat === null ? '' : String(body.gps_lat),
                gps_lng: body.gps_lng === null ? '' : String(body.gps_lng),
                gps_unavailable: body.gps_unavailable ? '1' : '0',
              },
              // The deliver endpoint names this part `signature`, not `file` (docs/04).
              'signature',
              attempt.key,
            )
          : // No file to send: a photo-only delivery, or a PIN fallback that no longer needs the
            // 1x1 placeholder image an older build had to invent.
            requestWithStatus<RawRefillRequest | null>(attempt.path, {
              method: 'POST',
              idempotencyKey: attempt.key,
              body,
            }),
        unitLookup(client),
      ]);

      return {
        refill: result.data ? toRefillRequest(result.data, unitOf) : null,
        ledgerPending: result.status === 202,
      };
    },
    onSuccess: (result, input) => {
      attempts.current.delete(deliveryAttemptId(input));
      invalidateRefillData(client, result.refill?.id);
    },
  });
}

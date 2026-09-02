import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { request, uploadFile, uploadFileWithStatus, uuidv4 } from '@/lib/api';
import { compressForUpload } from '@/lib/image';
import {
  toAllocation,
  toAppNotification,
  toRefillRequest,
  toStockRow,
  type RawAllocation,
  type RawAppNotification,
  type RawRefillRequest,
  type RawStockRow,
} from '@/lib/mappers';
import type { BadgeCounts, Product, RefillRequest, RefillStatus, StaffOnShift } from '@/domain/types';

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
  allocationsToday: ['allocations', 'today'] as const,
  myAllocation: ['me', 'allocation'] as const,
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

export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: async () => {
      const rows = await request<RawAppNotification[]>('/notifications?unread=1');
      return rows.map(toAppNotification);
    },
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

export function useMyAllocation() {
  return useQuery({
    queryKey: qk.myAllocation,
    queryFn: async () => {
      const raw = await request<RawAllocation | null>('/me/allocation/today');
      return raw ? toAllocation(raw) : null;
    },
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
  signatureUri: string;
  strokeCount: number;
  method: 'staff_signature' | 'pin_fallback';
  staffPin?: string;
  lines: { line_id: number; qty_received: number }[];
  gps: { lat: number; lng: number } | null;
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
      const [result, unitOf] = await Promise.all([
        uploadFileWithStatus<RawRefillRequest | null>(
          `/refills/${input.id}/deliver`,
          { uri: input.signatureUri, name: 'signature.png', type: 'image/png' },
          {
            signature_method: input.method,
            ...(input.staffPin ? { staff_pin: input.staffPin } : {}),
            lines: JSON.stringify(input.lines),
            stroke_count: String(input.strokeCount),
            gps_lat: input.gps ? String(input.gps.lat) : '',
            gps_lng: input.gps ? String(input.gps.lng) : '',
            gps_unavailable: input.gps === null ? '1' : '0',
          },
          // The deliver endpoint names this part `signature`, not `file` (docs/04).
          'signature',
          // `/deliver` carries `idempotent:require`; without this header the server answers 422
          // "Header Idempotency-Key wajib dikirim untuk aksi ini." before the handler ever runs.
          uuidv4(),
        ),
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

export type CreateAllocationInput = {
  operatingDate: string;
  cartId: number;
  staffId: number;
  locationId: number | null;
  lines: { product_id: number; qty_issued: number }[];
  correctionReason?: string;
};

export function useCreateAllocation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAllocationInput) => {
      const raw = await request<RawAllocation>('/allocations', {
        method: 'POST',
        idempotencyKey: uuidv4(),
        body: {
          operating_date: input.operatingDate,
          cart_id: input.cartId,
          staff_id: input.staffId,
          location_id: input.locationId,
          lines: input.lines,
          ...(input.correctionReason ? { correction_reason: input.correctionReason } : {}),
        },
      });
      return toAllocation(raw);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.allocationsToday });
      void client.invalidateQueries({ queryKey: qk.kitchenStock });
      void client.invalidateQueries({ queryKey: qk.badges });
    },
  });
}

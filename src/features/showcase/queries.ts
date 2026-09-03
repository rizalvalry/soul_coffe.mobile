import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { request, uuidv4 } from '@/lib/api';
import { toStockRow, type RawStockRow } from '@/lib/mappers';
import { qk as refillKeys } from '@/features/refill/queries';
import type {
  AttendanceRow,
  AttendanceStatus,
  Cart,
  CartStockRow,
  DailyAllowance,
  HandoverResult,
  Product,
  StaffPickerRow,
} from '@/domain/types';

/**
 * The showcase flow and absen, both added alongside Flow A/B rather than replacing them.
 *
 * Kept in its own feature folder rather than bolted onto `features/refill/queries.ts`: these
 * endpoints share no server-side state machine with the refill flow, and mixing them would make
 * the invalidation rules below read as if they did.
 */

/** Same reason as `features/refill/queries.ts`: one place for keys so invalidation cannot drift. */
export const showcaseKeys = {
  stock: ['showcase', 'stock'] as const,
  staff: ['showcase', 'staff'] as const,
  carts: ['carts'] as const,
  allowance: (cartId: number) => ['showcase', 'allowance', cartId] as const,
  absenStatus: ['absen', 'status'] as const,
  absenRoll: (date?: string) => ['absen', 'roll', date ?? 'today'] as const,
};

/**
 * Products carry `unit` only on the master-data list, exactly as in the refill queries — the
 * stock endpoints return product_id/name/qty and nothing else. Falls back to a blank unit rather
 * than failing a whole stock read over a label.
 */
async function unitLookup(client: QueryClient): Promise<(productId: number) => string> {
  try {
    const products = await client.ensureQueryData({
      queryKey: refillKeys.products,
      queryFn: () => request<Product[]>('/products'),
      staleTime: 10 * 60_000,
    });
    const byId = new Map(products.map((p) => [p.id, p.unit]));
    return (productId) => byId.get(productId) ?? '';
  } catch {
    return () => '';
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * The gerobak list. `/carts` has existed since Flow A but had no hook — nothing had needed to
 * pick a cart from the app before, because every earlier screen inferred it from the caller's
 * own assignment.
 */
export function useCarts() {
  return useQuery({
    queryKey: showcaseKeys.carts,
    queryFn: () => request<Cart[]>('/carts'),
    staleTime: 5 * 60_000, // master data
  });
}

/** Cups sitting in the showcase right now. */
export function useShowcaseStock() {
  const client = useQueryClient();
  return useQuery({
    queryKey: showcaseKeys.stock,
    queryFn: async (): Promise<CartStockRow[]> => {
      const [rows, unitOf] = await Promise.all([
        request<RawStockRow[]>('/showcase/stock'),
        unitLookup(client),
      ]);
      return rows.map((row) => toStockRow(row, unitOf));
    },
  });
}

/**
 * Every active staff member, not only those already rostered.
 *
 * That distinction is the feature: a cart with nobody assigned is precisely the case this form
 * exists to resolve, so a picker limited to today's roster would hide the staff the barista
 * needs. `assigned_cart_code` lets the row show an existing placement instead.
 */
export function useShowcaseStaff() {
  return useQuery({
    queryKey: showcaseKeys.staff,
    queryFn: () => request<StaffPickerRow[]>('/showcase/staff'),
    staleTime: 60_000,
  });
}

/** The pre-filled money field. Created on demand server-side, so this never 404s. */
export function useCartAllowance(cartId: number | null) {
  return useQuery({
    queryKey: showcaseKeys.allowance(cartId ?? 0),
    queryFn: () => request<DailyAllowance>(`/showcase/allowance/${cartId}`),
    enabled: typeof cartId === 'number' && cartId > 0,
  });
}

/**
 * What decides whether the absen button is pressable.
 *
 * Refetched on focus and on a short interval because the staff button unlocks from someone
 * ELSE's action (a barista pressing "Open Absen"), and a staff member staring at a disabled
 * button has no way to know it changed otherwise.
 */
export function useAttendanceStatus() {
  return useQuery({
    queryKey: showcaseKeys.absenStatus,
    queryFn: () => request<AttendanceStatus>('/absen/status'),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
}

export function useAttendanceRoll(date?: string) {
  return useQuery({
    queryKey: showcaseKeys.absenRoll(date),
    queryFn: () => request<AttendanceRow[]>(`/absen${date ? `?date=${date}` : ''}`),
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

export type BrewInput = { lines: { product_id: number; qty: number }[] };

/** Cups brewed into the showcase. Central stock goes up; nothing leaves. */
export function useBrewIntoShowcase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BrewInput) =>
      request<RawStockRow[]>('/showcase/brew', {
        method: 'POST',
        // R12 — a retried tap in a kitchen must not brew the same cups twice.
        idempotencyKey: uuidv4(),
        body: { lines: input.lines.filter((line) => line.qty > 0) },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: showcaseKeys.stock });
      // The kitchen stock screen reads the same ledger rows under a different key.
      void client.invalidateQueries({ queryKey: refillKeys.kitchenStock });
    },
  });
}

export type HandoverInput = {
  cartId: number;
  staffId: number;
  lines: { product_id: number; qty: number }[];
  /** Omitted means "keep today's amount" — the normal path, since the form arrives pre-filled. */
  allowanceAmount?: number;
  /** Only needed for a cart that has never had a location before. */
  locationId?: number;
};

/**
 * The Add Stock submit: cups move showcase -> cart, the day's money is recorded, and the cart
 * lands on today's roster as a result of the handover itself.
 */
export function useHandToCart() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: HandoverInput) =>
      request<HandoverResult>('/showcase/hand-to-cart', {
        method: 'POST',
        idempotencyKey: uuidv4(),
        body: {
          cart_id: input.cartId,
          staff_id: input.staffId,
          lines: input.lines.filter((line) => line.qty > 0),
          ...(input.allowanceAmount !== undefined ? { allowance_amount: input.allowanceAmount } : {}),
          ...(input.locationId !== undefined ? { location_id: input.locationId } : {}),
        },
      }),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: showcaseKeys.stock });
      void client.invalidateQueries({ queryKey: refillKeys.kitchenStock });
      void client.invalidateQueries({ queryKey: showcaseKeys.allowance(result.cart_id) });
      // A handover creates today's assignment, so the roster the other screens read changed too.
      void client.invalidateQueries({ queryKey: showcaseKeys.staff });
      void client.invalidateQueries({ queryKey: refillKeys.allocationsToday });
    },
  });
}

export type CloseOutInput = {
  cartId: number;
  /** Cups going back into the showcase to sell tomorrow. */
  returned: { product_id: number; qty: number }[];
  /** Cups written off. */
  rejected: { product_id: number; qty: number }[];
};

export function useCloseOutCart() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CloseOutInput) =>
      request<{ cart_id: number; cart_code: string; cart_stock: RawStockRow[]; showcase_stock: RawStockRow[] }>(
        '/showcase/close-out',
        {
          method: 'POST',
          idempotencyKey: uuidv4(),
          body: {
            cart_id: input.cartId,
            returned: input.returned.filter((line) => line.qty > 0),
            rejected: input.rejected.filter((line) => line.qty > 0),
          },
        },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: showcaseKeys.stock });
      void client.invalidateQueries({ queryKey: refillKeys.kitchenStock });
      void client.invalidateQueries({ queryKey: refillKeys.myStock });
    },
  });
}

/**
 * Clock in. Idempotent server-side, so a double tap is a replay rather than an error — the
 * screen does not need to guard the button against it.
 */
export function useClockIn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request<AttendanceRow>('/absen', { method: 'POST' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: showcaseKeys.absenStatus });
      void client.invalidateQueries({ queryKey: ['absen', 'roll'] });
    },
  });
}

/** Barista opens absen for every staff member today. */
export function useOpenStaffAbsen() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ operating_date: string; opened_by: number; opened_at: string }>('/absen/open', {
        method: 'POST',
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: showcaseKeys.absenStatus });
    },
  });
}

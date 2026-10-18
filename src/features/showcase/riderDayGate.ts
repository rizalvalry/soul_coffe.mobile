import type { AttendanceStatus } from '@/domain/types';
import { ApiError } from '@/lib/api';

export const DAY_NOT_OPEN_MESSAGE = 'Produksi belum membuka absen hari ini. Fitur transaksi belum bisa dipakai.';
export const RIDER_ABSEN_MESSAGE = 'Absen dulu sebelum memakai fitur transaksi. Buka Absen untuk melanjutkan.';
export const NO_CART_TODAY_MESSAGE = 'Produksi belum kasih stok ke gerobak kamu hari ini. Minta Produksi Add Stock dulu ya.';

export type RiderDayGate = 'legacy' | 'closed' | 'attendance' | 'ready';

/** Older servers do not send staff_window_open; retain their existing client behavior. */
export function riderDayGate(status?: AttendanceStatus): RiderDayGate {
  if (typeof status?.staff_window_open !== 'boolean') return 'legacy';
  if (!status.staff_window_open) return 'closed';
  return status.has_clocked_in ? 'ready' : 'attendance';
}

export function riderGateMessage(gate: RiderDayGate): string | null {
  if (gate === 'closed') return DAY_NOT_OPEN_MESSAGE;
  if (gate === 'attendance') return RIDER_ABSEN_MESSAGE;
  return null;
}

/** A failed status refresh leaves the timestamp unchanged; the next fresh ready result releases the queue. */
export function shouldResumeQueuedSales(
  previous: RiderDayGate,
  current: RiderDayGate,
  refreshedAt: number,
  heldAfterAt: number,
): boolean {
  return current === 'ready' && (previous !== 'ready' || refreshedAt > heldAfterAt);
}

export function isDayNotOpen(error: unknown): boolean {
  return error instanceof ApiError &&
    !!error.body && typeof error.body === 'object' &&
    (error.body as { code?: unknown }).code === 'DAY_NOT_OPEN';
}

export function isNoCartToday(error: unknown): boolean {
  return error instanceof ApiError &&
    !!error.body && typeof error.body === 'object' &&
    (error.body as { code?: unknown }).code === 'NO_CART_TODAY';
}

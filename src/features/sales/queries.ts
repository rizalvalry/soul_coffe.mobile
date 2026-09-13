import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { request, uuidv4 } from '@/lib/api';
import { qk as refillKeys } from '@/features/refill/queries';
import { showcaseKeys } from '@/features/showcase/queries';
import { buildSaleBody } from './offlineQueue';
import type { PaymentMethod, Sale } from '@/domain/types';

/**
 * Penjualan gerobak — cups leaving the cart because somebody bought them.
 *
 * Its own feature folder for the same reason `features/showcase` is: this shares no state machine
 * with the refill flow. What it DOES share is the cart's stock, which is why every successful
 * sale invalidates `myStock` — a staff member who sells four cups and then opens "Stok Gerobak"
 * must see four fewer, without pulling to refresh.
 */
export const salesKeys = {
  today: ['sales', 'today'] as const,
};

/** Today's transactions for the caller's own cart, newest first. */
export function useTodaySales() {
  return useQuery({
    queryKey: salesKeys.today,
    queryFn: () => request<Sale[]>('/sales'),
  });
}

export type RecordSaleInput = {
  lines: { product_id: number; qty: number }[];
  paymentMethod: PaymentMethod;
  gps: { lat: number; lng: number } | null;
  note?: string;
  deviceId?: string;
};

/**
 * Records one transaction.
 *
 * The `uuid` is generated here, ONCE per submit, and travels in the body as well as in the
 * Idempotency-Key header. That is not belt-and-braces: the header protects against a retry of
 * the same HTTP request, and the body's uuid protects against the app resending a transaction it
 * already sent — which is what happens when a staff member in a queue taps submit, loses signal
 * before the response lands, and taps again. The server returns the sale that already exists
 * rather than selling the cups twice (R14).
 *
 * A large transaction is accepted here like any other. The server may flag it for Administrator
 * and Finance, and deliberately tells this screen nothing about that.
 */
export function useRecordSale() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordSaleInput) => {
      const uuid = uuidv4();

      // Same body shape the offline queue replays later under this same uuid — see
      // offlineQueue.ts's `buildSaleBody` for why that sharing matters.
      return request<Sale>('/sales', {
        method: 'POST',
        idempotencyKey: uuid,
        body: buildSaleBody(uuid, input),
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: salesKeys.today });
      // The cups came out of the cart's stock.
      void client.invalidateQueries({ queryKey: refillKeys.myStock });
      // And out of the central total the barista and the panel read.
      void client.invalidateQueries({ queryKey: showcaseKeys.stock });
    },
  });
}

/**
 * Undoes a sale within the window the server allows — a mis-tap or the wrong quantity, corrected
 * while the customer is still at the cart. The server is the only place that actually enforces
 * who may void and until when (see SaleService::void()); this screen just offers the button and
 * shows whatever message comes back when it is too late.
 */
export function useVoidSale() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ saleId, reason }: { saleId: number; reason: string }) =>
      request<Sale>(`/sales/${saleId}/void`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: salesKeys.today });
      void client.invalidateQueries({ queryKey: refillKeys.myStock });
      void client.invalidateQueries({ queryKey: showcaseKeys.stock });
    },
  });
}

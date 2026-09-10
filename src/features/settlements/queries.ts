import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { request, uuidv4 } from '@/lib/api';
import { qk as refillKeys } from '@/features/refill/queries';
import { showcaseKeys } from '@/features/showcase/queries';
import type { Settlement, SettlementDraft, SettlementQueueRow } from '@/domain/types';

/**
 * Setoran — Finance taking the day's money, then settling the cups that came back.
 *
 * Every number except the money itself comes from the server: cups issued, sold and remaining are
 * computed from the ledger and the transactions, so nobody has to recite them across a desk with
 * a queue waiting.
 */
export const settlementKeys = {
  queue: (date?: string) => ['settlements', 'queue', date ?? 'today'] as const,
  draft: (cartId: number) => ['settlements', 'draft', cartId] as const,
  list: (date?: string) => ['settlements', 'list', date ?? 'today'] as const,
};

/** Who is still waiting to deposit today, undeposited carts first. */
export function useSettlementQueue(date?: string) {
  return useQuery({
    queryKey: settlementKeys.queue(date),
    queryFn: () => request<SettlementQueueRow[]>(`/settlements/queue${date ? `?date=${date}` : ''}`),
    // The queue changes as staff keep selling right up to the moment they hand over, so this is
    // one of the few reads worth refetching on its own.
    refetchInterval: 60_000,
  });
}

/** Everything the deposit form already knows for one cart. */
export function useSettlementDraft(cartId: number | null) {
  return useQuery({
    queryKey: settlementKeys.draft(cartId ?? 0),
    queryFn: () => request<SettlementDraft>(`/settlements/draft/${cartId}`),
    enabled: typeof cartId === 'number' && cartId > 0,
  });
}

export function useSettlements(date?: string) {
  return useQuery({
    queryKey: settlementKeys.list(date),
    queryFn: () => request<Settlement[]>(`/settlements${date ? `?date=${date}` : ''}`),
  });
}

export type RecordSettlementInput = {
  cartId: number;
  /** Whole rupiah (R9) — no decimals anywhere near money. */
  cash: number;
  qris: number;
  transfer: number;
  /** Required by the server when the total does not match the transactions. */
  varianceReason?: string;
};

export function useRecordSettlement() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordSettlementInput) =>
      request<Settlement>('/settlements', {
        method: 'POST',
        idempotencyKey: uuidv4(),
        body: {
          cart_id: input.cartId,
          cash: input.cash,
          qris: input.qris,
          transfer: input.transfer,
          ...(input.varianceReason ? { variance_reason: input.varianceReason } : {}),
        },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['settlements'] });
    },
  });
}

export type ApproveSettlementInput = {
  settlementId: number;
  /** What happens to the cups still on the cart. May be empty when there are none. */
  lines: { product_id: number; qty_returned: number; qty_rejected: number }[];
  note?: string;
};

export function useApproveSettlement() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: ApproveSettlementInput) =>
      request<Settlement>(`/settlements/${input.settlementId}/approve`, {
        method: 'POST',
        idempotencyKey: uuidv4(),
        body: {
          lines: input.lines.filter((line) => line.qty_returned > 0 || line.qty_rejected > 0),
          ...(input.note ? { note: input.note } : {}),
        },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['settlements'] });
      // Cups going back to the showcase change the kitchen's stock, and the rejects change it
      // too by leaving the system.
      void client.invalidateQueries({ queryKey: showcaseKeys.stock });
      void client.invalidateQueries({ queryKey: refillKeys.kitchenStock });
    },
  });
}

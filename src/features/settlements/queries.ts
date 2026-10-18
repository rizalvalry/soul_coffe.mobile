import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

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
  draft: (cartId: number, date?: string) => ['settlements', 'draft', cartId, date ?? 'today'] as const,
  list: (date?: string) => ['settlements', 'list', date ?? 'today'] as const,
};

/** Refresh the shared queue/list and the affected cart's draft after a server change. */
export function invalidateSettlementData(client: QueryClient, cartId?: number | null) {
  void client.invalidateQueries({ queryKey: ['settlements', 'queue'] });
  void client.invalidateQueries({ queryKey: ['settlements', 'list'] });
  void client.invalidateQueries({
    queryKey: typeof cartId === 'number' && Number.isSafeInteger(cartId) && cartId > 0
      ? ['settlements', 'draft', cartId]
      : ['settlements', 'draft'],
  });
}

/** Who is still waiting to deposit today, undeposited carts first. */
export function useSettlementQueue(date?: string) {
  return useQuery({
    queryKey: settlementKeys.queue(date),
    queryFn: () => request<SettlementQueueRow[]>(`/settlements/queue${date ? `?date=${date}` : ''}`),
  });
}

/** Everything the deposit form already knows for one cart. */
export function useSettlementDraft(cartId: number | null, date?: string) {
  return useQuery({
    queryKey: settlementKeys.draft(cartId ?? 0, date),
    queryFn: () => request<SettlementDraft>(`/settlements/draft/${cartId}${date ? `?date=${date}` : ''}`),
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
  idempotencyKey: string;
  cartId: number;
  date?: string;
  /** Whole rupiah (R9) — no decimals anywhere near money. */
  cash: number;
  qris: number;
  transfer: number;
  /** Optional, including when the total differs from the transactions. */
  varianceReason?: string;
};

export function useRecordSettlement() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordSettlementInput) =>
      request<Settlement>(`/settlements${input.date ? `?date=${input.date}` : ''}`, {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
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

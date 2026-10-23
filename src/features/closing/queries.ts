import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '@/lib/api';
import { invalidateSettlementData } from '@/features/settlements/queries';
import { riderSettlementKey } from '@/features/settlements/rider';
import type { ClosingPoint } from './locationCheck';
import { qk as refillKeys } from '@/features/refill/queries';

export type ClosingLine = {
  product_id: number;
  product_name: string;
  qty_in: number;
  qty_carry: number;
  qty_office_sold: number;
  qty_remaining: number;
  qty_wasted: number;
  qty_sold: number;
  unit_price_minor: number;
  subtotal_minor: number;
};

export type ClosingDraft = {
  cart_id: number;
  cart_code: string;
  operating_date: string;
  closing_id: number | null;
  note: string | null;
  can_correct: boolean;
  carry_warning: boolean;
  total_minor: number;
  qris_minor: number;
  transfer_minor: number;
  cash_minor: number;
  closing_point: ClosingPoint;
  outside_closing_point: boolean;
  closing_distance_m: number | null;
  lines: ClosingLine[];
  commission: {
    has_closing: boolean;
    cups_sold: number;
    commission_minor: number;
    tier_min_cups: number | null;
    amount_per_cup_minor: number;
    next_tier_min_cups: number | null;
    cups_to_next_tier: number | null;
    locked: boolean;
  };
};

export const closingKeys = { draft: ['me', 'closing', 'draft'] as const };

export function useClosingDraft() {
  return useQuery({
    queryKey: closingKeys.draft,
    queryFn: () => request<ClosingDraft>('/me/closing/draft'),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export type ClosingInput = {
  key: string;
  lines: { product_id: number; qty_remaining: number; qty_wasted: number }[];
  qris: number;
  transfer: number;
  note?: string;
  gps?: { lat: number; lng: number } | null;
};

export function useRecordClosing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ClosingInput) => request<ClosingDraft>('/me/closing', {
      method: 'POST',
      idempotencyKey: input.key,
      body: {
        lines: input.lines, qris: input.qris, transfer: input.transfer,
        note: input.note || null,
        ...(input.gps ? { gps_lat: input.gps.lat, gps_lng: input.gps.lng } : { gps_unavailable: true }),
      },
    }),
    onSuccess: (result) => {
      client.setQueryData(closingKeys.draft, result);
      invalidateSettlementData(client, result.cart_id);
      void client.invalidateQueries({ queryKey: riderSettlementKey });
      void client.invalidateQueries({ queryKey: refillKeys.myStock });
    },
  });
}

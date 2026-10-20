import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { request } from '@/lib/api';

export type AgingRow = {
  sale_date: string;
  outstanding_minor: number;
  age_days: number;
  bucket: string;
  flagged: boolean;
};

export type ClearingAging = {
  as_of: string;
  rows: AgingRow[];
  buckets: { '0_1_minor': number; '2_3_minor': number; over_3_minor: number };
  unmatched_credit_minor: number;
  unattributed_minor: number;
  net_balance_minor: number;
};

export type ClearingReceipt = {
  id: number;
  received_on: string;
  amount_minor: number;
  mdr_minor: number;
  status: 'POSTED' | 'VOID';
  allocations: { sale_date: string; amount_minor: number }[];
};

export type ClearingInput = {
  uuid: string;
  received_on: string;
  amount_minor: number;
  mdr_minor: number;
  bank_account_id: number;
  sale_dates: string[];
};

export function useClearingOptions() {
  return useQuery({
    queryKey: ['clearing', 'options'],
    queryFn: () => request<{ bank_account_id: number; aging: ClearingAging }>('/clearing-receipts/options'),
  });
}

export function useClearingReceipts() {
  return useQuery({
    queryKey: ['clearing', 'receipts'],
    queryFn: () => request<ClearingReceipt[]>('/clearing-receipts'),
  });
}

export function useRecordClearing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ClearingInput) => request<ClearingReceipt>('/clearing-receipts', {
      method: 'POST', idempotencyKey: input.uuid, body: input,
    }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['clearing'] }),
  });
}

export function useVoidClearing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; reason: string; key: string }) =>
      request<ClearingReceipt>(`/clearing-receipts/${input.id}/void`, {
        method: 'POST', idempotencyKey: input.key, body: { reason: input.reason },
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['clearing'] }),
  });
}

export function useMatchClearing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; sale_dates: string[]; uuid: string }) =>
      request<ClearingReceipt>(`/clearing-receipts/${input.id}/match`, {
        method: 'POST', idempotencyKey: input.uuid,
        body: { uuid: input.uuid, sale_dates: input.sale_dates },
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['clearing'] }),
  });
}

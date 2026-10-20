import { useQuery } from '@tanstack/react-query';
import { request } from '@/lib/api';

export type RiderDailySettlement = {
  closing: {
    id: number;
    cart_code: string;
    operating_date: string;
    total_minor: number;
    cash_minor: number;
    qris_minor: number;
    transfer_minor: number;
  } | null;
  status: 'WAITING_FINANCE' | 'RECORDED' | 'APPROVED' | null;
  settlement_status?: string | null;
};

export const riderSettlementKey = ['me', 'settlement'] as const;

export function useRiderDailySettlement(operatingDate?: string) {
  return useQuery({
    queryKey: [...riderSettlementKey, operatingDate ?? 'today'],
    queryFn: () => request<RiderDailySettlement>('/me/settlement' + (operatingDate ? `?operating_date=${encodeURIComponent(operatingDate)}` : '')),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

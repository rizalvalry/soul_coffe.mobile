import type { ClosingDraft } from './queries';

export function commissionSummary(commission: ClosingDraft['commission']): { earned: string; progress: string | null } {
  const money = `Rp ${commission.commission_minor.toLocaleString('id-ID')}`;
  const tier = commission.tier_min_cups === null
    ? 'belum ada tier yang tercapai'
    : `tier ≥${commission.tier_min_cups}`;
  return {
    earned: `Hari ini kamu jual ${commission.cups_sold} cup — komisi ${money} (${tier})`,
    progress: commission.next_tier_min_cups === null || commission.cups_to_next_tier === null
      ? null
      : `${commission.cups_to_next_tier} cup lagi buat sampai tier ≥${commission.next_tier_min_cups}.`,
  };
}

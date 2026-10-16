import type { SettlementDraft, SettlementQueueRow } from '@/domain/types';

type ExpectedSource = SettlementDraft | SettlementQueueRow;

type Expectations = {
  total: number;
  cash: number | null;
  qris: number | null;
  transfer: number | null;
};

/** Prefer the current draft; old API responses still carry the total. */
export function settlementExpectations(
  draft: SettlementDraft | undefined,
  row: SettlementQueueRow,
): Expectations {
  const source: ExpectedSource = draft ?? row;
  const hasMethods = typeof source.expected_cash_minor === 'number' &&
    typeof source.expected_qris_minor === 'number' &&
    typeof source.expected_transfer_minor === 'number';

  return {
    total: source.expected_total_minor ?? source.expected_total ?? 0,
    cash: hasMethods ? source.expected_cash_minor! : null,
    qris: hasMethods ? source.expected_qris_minor! : null,
    transfer: hasMethods ? source.expected_transfer_minor! : null,
  };
}

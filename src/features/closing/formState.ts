import type { ClosingDraft } from './queries';

/** A point-only refetch must not replace cups and payment amounts already entered. */
export function closingFormSignature(draft: ClosingDraft): string {
  return JSON.stringify([
    draft.cart_id, draft.operating_date, draft.closing_id,
    draft.lines.map((line) => [line.product_id, line.qty_in, line.qty_carry,
      line.qty_remaining, line.qty_wasted]),
    draft.qris_minor, draft.transfer_minor,
  ]);
}

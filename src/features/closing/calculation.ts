export type ClosingInputLine = {
  product_id: number;
  qty_in: number;
  qty_carry: number;
  qty_office_sold: number;
  unit_price_minor: number;
};

export function closingTotals(
  lines: ClosingInputLine[],
  remaining: Record<number, number>,
  wasted: Record<number, number>,
  qris: number,
  transfer: number,
) {
  let total = 0;
  let cupsSold = 0;
  let valid = Number.isSafeInteger(qris) && qris >= 0 && Number.isSafeInteger(transfer) && transfer >= 0;
  const soldByProduct: Record<number, number> = {};
  for (const line of lines) {
    const rest = remaining[line.product_id];
    const waste = wasted[line.product_id] ?? 0;
    const sold = line.qty_in + line.qty_carry - line.qty_office_sold - (rest ?? -1) - waste;
    valid = valid && Number.isSafeInteger(rest) && (rest ?? -1) >= 0 &&
      Number.isSafeInteger(waste) && waste >= 0 && sold >= 0;
    soldByProduct[line.product_id] = sold;
    cupsSold += sold;
    total += sold * line.unit_price_minor;
  }
  valid = valid && Number.isSafeInteger(total) && qris + transfer <= total;
  return { valid, cupsSold, soldByProduct, total, cash: total - qris - transfer };
}

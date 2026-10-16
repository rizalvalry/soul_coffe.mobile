/** Keep notification links limited to IDs and dates the settlement screen can safely query. */
export function settlementTarget(data: Record<string, unknown>): { date?: string; cartId: number | null } {
  const rawDate = data['operating_date'] ?? data['date'];
  const date = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    && Number.isFinite(Date.parse(rawDate)) && new Date(rawDate).toISOString().slice(0, 10) === rawDate
    ? rawDate : undefined;

  const rawCartId = data['cart_id'];
  const cartId = typeof rawCartId === 'number'
    ? rawCartId
    : typeof rawCartId === 'string' && /^\d+$/.test(rawCartId) ? Number(rawCartId) : NaN;

  return { date, cartId: Number.isSafeInteger(cartId) && cartId > 0 ? cartId : null };
}

export function settlementRoute(data: Record<string, unknown>): string {
  const { date, cartId } = settlementTarget(data);
  const params = [
    ...(date ? [`date=${date}`] : []),
    ...(cartId !== null ? [`cart_id=${cartId}`] : []),
  ];
  return `/finance/settlements${params.length ? `?${params.join('&')}` : ''}`;
}

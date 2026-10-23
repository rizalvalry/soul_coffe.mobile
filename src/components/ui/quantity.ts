export function clampQty(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatQty(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function parseQtyInput(text: string, min: number, max: number): number {
  const digits = text.replace(/[^\d]/g, '');
  return digits === '' ? min : clampQty(Number.parseInt(digits, 10), min, max);
}

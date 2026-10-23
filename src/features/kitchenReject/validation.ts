export type RejectLine = { product_id: number; qty: number };
export type RejectReason = 'DROPPED' | 'PACKAGING' | 'QUALITY' | 'OTHER';

export function validateKitchenReject(lines: RejectLine[], stock: Record<number, number>,
  reason: RejectReason | null, note: string, photoUri: string | null): string | null {
  if (lines.length === 0) return 'Pilih produk dan isi jumlah cups yang rusak dulu ya.';
  if (new Set(lines.map((line) => line.product_id)).size !== lines.length) return 'Produk yang sama cukup satu baris ya.';
  for (const line of lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 9999) return 'Jumlah per produk harus 1–9.999 cups ya.';
    if (line.qty > (stock[line.product_id] ?? 0)) return 'Stok showcase tidak cukup untuk produk yang dipilih.';
  }
  if (!reason) return 'Pilih alasan reject dulu ya.';
  if (reason === 'OTHER' && !note.trim()) return 'Tulis alasan reject dulu ya.';
  if (note.length > 500) return 'Catatan maksimal 500 karakter ya.';
  if (!photoUri) return 'Ambil foto reject dulu ya.';
  return null;
}

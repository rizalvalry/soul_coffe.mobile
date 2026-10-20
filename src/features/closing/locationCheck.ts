export type ClosingPoint = {
  basis: 'kitchen' | 'selling_location';
  label: string;
  lat: number | null;
  lng: number | null;
  radius_m: number;
};

export function closingLocationMessage(point: ClosingPoint, gps: { lat: number; lng: number } | null): string {
  if (!gps) return `GPS belum tersedia. Sudah selesai jualan? Closing tetap bisa dikirim dan akan ditandai.`;
  if (point.lat === null || point.lng === null) return `Pin ${point.label} belum tersedia. Closing tetap bisa dikirim dan akan ditandai.`;
  const a = (gps.lat - point.lat) * 111_320;
  const b = (gps.lng - point.lng) * 111_320 * Math.cos(((gps.lat + point.lat) / 2) * Math.PI / 180);
  const metres = Math.round(Math.sqrt(a * a + b * b));
  const distance = metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1).replace('.', ',')} km`;
  if (metres > point.radius_m) return `Kamu masih ${distance} dari ${point.label}. Sudah selesai jualan? Closing tetap bisa dikirim dan akan ditandai.`;
  return `Kamu sudah dekat ${point.label} (${distance}).`;
}

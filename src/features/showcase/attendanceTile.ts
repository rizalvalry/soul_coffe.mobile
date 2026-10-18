import type { AttendanceStatus } from '@/domain/types';
import type { Role } from '@/domain/roles';

export function attendanceTileSubtitle(role: Role, status?: AttendanceStatus): string {
  if (!status) return 'Status absen sedang dimuat';
  if (role === 'BARISTA') {
    if (!status.has_clocked_in) return 'Yuk absen dulu';
    return status.staff_window_open ? 'Kamu sudah absen, Rider bisa absen' : 'Kamu sudah absen, buka absen Rider';
  }
  if (status.has_clocked_in) return 'Kamu sudah absen';
  if (status.staff_window_open) return 'Absen sudah dibuka, yuk absen';
  return 'Produksi belum buka absen hari ini';
}

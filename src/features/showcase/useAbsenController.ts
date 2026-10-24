import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import {
  useAttendanceRoll,
  useAttendanceStatus,
  useClockIn,
  useOpenStaffAbsen,
} from '@/features/showcase/queries';
import { useAuth } from '@/features/auth/store';
import { ApiError } from '@/lib/api';

/**
 * Absen — one screen for both Barista and Rider.
 *
 * Every enable/disable decision here comes from `GET /absen/status`, not from re-deriving the
 * rule client-side. The sequence (barista clocks in, opens the gate, then rider may clock in)
 * lives in one place on the server; a second copy in the app would be a second place for it to
 * be wrong, and the two would drift the first time the rule changed.
 *
 * The status query is refreshed by the realtime provider when Produksi opens the Rider window.
 */
function clockTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type Fix = { lat: number; lng: number; accuracy: number | null };

const METRES_PER_DEGREE = 111_320;

/**
 * Same equirectangular approximation the server uses, so the number on screen and the number in
 * the refusal message agree. Over tens of metres its error is far below a phone's own accuracy.
 */
function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * METRES_PER_DEGREE;
  const dLng = (b.lng - a.lng) * METRES_PER_DEGREE * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
}

export function useAbsenController() {
  const router = useRouter();
  const user = useAuth((s) => s.session?.user);
  const role = user?.role;
  const canAttend = role === 'BARISTA' || role === 'STAFF';
  const canOpenKitchen = user?.isSuperAdmin === true || user?.abilities?.['kitchen_operations']?.includes('edit') === true;
  const statusQuery = useAttendanceStatus(canAttend || canOpenKitchen);
  const rollQuery = useAttendanceRoll();
  const clockIn = useClockIn();
  const openStaffAbsen = useOpenStaffAbsen();

  const [banner, setBanner] = useState<string | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);

  const status = statusQuery.data;
  const roll = rollQuery.data ?? [];
  const geofence = status?.geofence;

  /**
   * Reads the phone's position.
   *
   * Absen is the one screen where this matters enough to ask for on arrival: the server may
   * refuse without it, and finding that out only after pressing the button would waste the walk.
   * A denial or a failure is not treated as an error here — plenty of kitchens have no geofence
   * at all, and for them the absen works exactly as it always did.
   */
  const locate = useCallback(async (): Promise<Fix | null> => {
    setLocating(true);
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      const granted = permission.granted
        ? true
        : (await Location.requestForegroundPermissionsAsync()).granted;

      if (!granted) return null;

      const position = await Location.getCurrentPositionAsync({
        // Absen is judged in metres, so this is the one place the highest accuracy is worth its
        // battery: being wrongly refused by a lazy fix is worse than a few seconds of GPS.
        accuracy: Location.LocationAccuracy.High,
      });

      const next: Fix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: typeof position.coords.accuracy === 'number' ? Math.round(position.coords.accuracy) : null,
      };

      setFix(next);
      return next;
    } catch {
      return null;
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    if (canAttend) void locate();
  }, [canAttend, locate]);

  /** How far the phone is from where it needs to be, or null when nothing is enforced. */
  const distance = useMemo(() => {
    if (!geofence?.enforced || geofence.lat === null || geofence.lng === null || !fix) return null;
    return metresBetween({ lat: geofence.lat, lng: geofence.lng }, fix);
  }, [geofence, fix]);

  const withinRange = distance !== null && geofence ? distance <= geofence.radius_m : null;

  const act = async (run: () => Promise<unknown>) => {
    setBanner(null);
    try {
      await run();
    } catch (e) {
      setBanner(e instanceof ApiError ? e.message : 'Terjadi kesalahan tidak terduga.');
    }
  };

  const clockInNow = () => void act(async () => {
    const current = (await locate()) ?? fix;
    return clockIn.mutateAsync(current ? { lat: current.lat, lng: current.lng } : null);
  });
  const openRiderAttendance = () => void act(() => openStaffAbsen.mutateAsync());
  const refresh = () => {
    void statusQuery.refetch();
    void rollQuery.refetch();
  };

  return { router, canAttend, canOpenKitchen, statusQuery, rollQuery, clockIn, openStaffAbsen,
    banner, locating, status, roll, geofence, locate, distance, withinRange, clockInNow,
    openRiderAttendance, refresh, clockTime };
}

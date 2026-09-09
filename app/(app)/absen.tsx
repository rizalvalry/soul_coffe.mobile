import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { SectionTitle } from '@/components/ui/Section';
import { enter } from '@/components/ui/Motion';
import {
  useAttendanceRoll,
  useAttendanceStatus,
  useClockIn,
  useOpenStaffAbsen,
} from '@/features/showcase/queries';
import { useAuth } from '@/features/auth/store';
import { ApiError } from '@/lib/api';
import { brand, feedback, radius, semantic, space } from '@/theme';

/**
 * Absen — one screen for both Barista and Staff.
 *
 * Every enable/disable decision here comes from `GET /absen/status`, not from re-deriving the
 * rule client-side. The sequence (barista clocks in, opens the gate, then staff may clock in)
 * lives in one place on the server; a second copy in the app would be a second place for it to
 * be wrong, and the two would drift the first time the rule changed.
 *
 * The status query polls, because a staff member's button unlocks from somebody ELSE's action —
 * without that they would sit looking at a disabled button with no way to know it had changed.
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

export default function AbsenScreen() {
  const role = useAuth((s) => s.session?.user.role);
  const statusQuery = useAttendanceStatus();
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
    void locate();
  }, [locate]);

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

  if (statusQuery.isLoading) {
    return (
      <Screen>
        <SkeletonList count={2} lines={2} />
      </Screen>
    );
  }

  if (statusQuery.isError || !status) {
    return (
      <Screen>
        <Card style={styles.stateCard}>
          <EmptyState
            icon="wifi-off"
            title="Gagal memuat absen"
            subtitle="Periksa koneksi Anda."
            tone="danger"
          />
          <Button label="Coba Lagi" icon="refresh" onPress={() => void statusQuery.refetch()} />
        </Card>
      </Screen>
    );
  }

  const refresh = () => {
    void statusQuery.refetch();
    void rollQuery.refetch();
  };

  return (
    <Screen refreshing={statusQuery.isRefetching} onRefresh={refresh}>
      <Text variant="h2">Absen</Text>
      <Text variant="caption" color={semantic.textMuted}>
        {status.operating_date}
      </Text>

      {/* The one big button. */}
      <Card style={styles.card}>
        <View style={styles.hero}>
          <View
            style={[
              styles.heroIcon,
              { backgroundColor: status.has_clocked_in ? brand[50] : semantic.surfaceSunken },
            ]}
          >
            <MaterialCommunityIcons
              name={status.has_clocked_in ? 'check-circle' : 'clock-outline'}
              size={34}
              color={status.has_clocked_in ? brand[700] : semantic.textMuted}
            />
          </View>

          {status.has_clocked_in ? (
            <>
              <Text variant="h3">Sudah absen</Text>
              <Text variant="caption" color={semantic.textMuted}>
                Tercatat pukul {clockTime(status.clocked_in_at)}
              </Text>
            </>
          ) : (
            <>
              <Text variant="h3">Belum absen</Text>
              <Text variant="caption" color={semantic.textMuted}>
                {status.blocked_reason ?? 'Tekan tombol di bawah untuk mulai shift.'}
              </Text>
            </>
          )}
        </View>

        {banner ? <Banner tone="danger" message={banner} /> : null}

        {/*
          The location rule, stated before the button rather than discovered by being refused.
          Rendered only when something is actually enforced: a kitchen with no pin, an exempt
          cart, or the rule switched off all mean there is nothing here worth saying.
        */}
        {!status.has_clocked_in && geofence?.enforced ? (
          <View style={styles.geoBlock}>
            <View style={styles.geoRow}>
              <MaterialCommunityIcons
                name={
                  withinRange === null
                    ? 'crosshairs-question'
                    : withinRange
                      ? 'map-marker-check-outline'
                      : 'map-marker-alert-outline'
                }
                size={18}
                color={withinRange === false ? feedback.dangerFg : brand[600]}
              />
              <Text variant="caption" color={semantic.textMuted} style={styles.geoText}>
                {locating
                  ? 'Mengambil lokasi Anda…'
                  : distance === null
                    ? `Absen harus dilakukan dalam ${geofence.radius_m} m dari ${geofence.label ?? 'lokasi yang ditentukan'}. Nyalakan lokasi (GPS) di HP Anda.`
                    : withinRange
                      ? `Anda ${distance} m dari ${geofence.label ?? 'lokasi absen'} — masih di dalam batas ${geofence.radius_m} m.`
                      : `Anda ${distance} m dari ${geofence.label ?? 'lokasi absen'}, batasnya ${geofence.radius_m} m. Mendekatlah dulu.`}
              </Text>
            </View>

            <Button
              label="Perbarui Lokasi"
              icon="crosshairs-gps"
              variant="ghost"
              size="sm"
              loading={locating}
              onPress={() => void locate()}
            />
          </View>
        ) : null}

        {/* An exemption is worth showing: it explains why this phone's rule differs from a
            colleague's, and it is the answer to "kenapa saya bisa absen dari sini?". */}
        {!status.has_clocked_in && geofence?.basis === 'exempt' && geofence.exemption_reason ? (
          <Banner tone="info" message={`Izin absen luar lokasi berlaku: ${geofence.exemption_reason}`} />
        ) : null}

        {!status.has_clocked_in ? (
          <Button
            label="Absen Sekarang"
            icon="fingerprint"
            // The fix is refreshed at the moment of pressing, not reused from arrival: somebody
            // who walked closer after being told they were too far must not be judged on where
            // they were standing a minute ago.
            onPress={() =>
              void act(async () => {
                const current = (await locate()) ?? fix;
                return clockIn.mutateAsync(current ? { lat: current.lat, lng: current.lng } : null);
              })
            }
            loading={clockIn.isPending || locating}
            // Disabled state and its copy both come from the server — see the docblock. The
            // geofence deliberately does NOT disable the button: the server decides, and a phone
            // whose fix is stale or inaccurate should still be allowed to try.
            disabled={!status.can_clock_in}
            hint={status.can_clock_in ? undefined : (status.blocked_reason ?? undefined)}
          />
        ) : null}

        {/*
          Barista-only, and only after their own absen: "Open Absen" asserts that the coffee is
          ready, which is only meaningful from someone who has actually started their shift.
        */}
        {status.can_open_staff_window ? (
          <Animated.View entering={enter('below')}>
            <Banner
              tone="info"
              message="Kopi sudah siap di showcase? Buka absen agar staff bisa mulai absen."
            />
            <Button
              label="Open Absen Staff"
              icon="lock-open-variant-outline"
              variant="secondary"
              onPress={() => void act(() => openStaffAbsen.mutateAsync())}
              loading={openStaffAbsen.isPending}
              hint="Membuka absen untuk seluruh staff hari ini"
            />
          </Animated.View>
        ) : null}

        {role === 'BARISTA' && status.staff_window_open ? (
          <Banner tone="success" message="Absen staff sudah dibuka untuk hari ini." />
        ) : null}
      </Card>

      {/* Who is on shift. Ordinary shift information, so both roles see it. */}
      <SectionTitle title="Sudah absen hari ini" caption={`${roll.length} orang`} icon="account-group-outline" />
      <Card style={styles.card}>
        {roll.length === 0 ? (
          <EmptyState
            icon="account-clock-outline"
            title="Belum ada yang absen"
            subtitle="Barista biasanya yang pertama, sebelum meracik kopi."
            tone="neutral"
          />
        ) : (
          <View style={styles.rollList}>
            {roll.map((row, index) => (
              <Animated.View key={row.id} entering={enter('below', index, 8)}>
                <View style={styles.rollRow}>
                  <View style={styles.rollAvatar}>
                    <MaterialCommunityIcons name="account" size={18} color={semantic.textMuted} />
                  </View>
                  <View style={styles.rollText}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {row.user_name ?? `#${row.user_id}`}
                    </Text>
                    <Text variant="micro" color={semantic.textSubtle}>
                      {row.role}
                    </Text>
                  </View>
                  <Chip tone="brand" label={clockTime(row.clocked_in_at)} />
                </View>
              </Animated.View>
            ))}
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stateCard: { gap: space.md, alignItems: 'center' },
  card: { gap: space.md },
  hero: { alignItems: 'center', gap: space.xs, paddingVertical: space.md },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  geoBlock: { gap: space.xs },
  geoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  geoText: { flex: 1 },

  rollList: { gap: space.sm },
  rollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.sm,
    backgroundColor: semantic.surfaceSunken,
  },
  rollAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.surface,
  },
  rollText: { flex: 1, gap: space.xxs },
});

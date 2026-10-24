import { StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { SectionTitle } from '@/components/ui/Section';
import { enter } from '@/components/ui/Motion';
import { useAbsenController } from '@/features/showcase/useAbsenController';
import { roleMeta } from '@/domain/roles';
import { brand, feedback, radius, semantic, space } from '@/theme';

export default function AbsenScreen() {
  const { router, canAttend, canOpenKitchen, statusQuery, rollQuery, clockIn, openStaffAbsen,
    banner, locating, status, roll, geofence, locate, distance, withinRange, clockInNow,
    openRiderAttendance, refresh, clockTime } = useAbsenController();

  if (!canAttend && !canOpenKitchen) {
    return (
      <Screen refreshing={rollQuery.isRefetching} onRefresh={() => void rollQuery.refetch()}>
        <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
        <Text variant="h2">Daftar Hadir</Text>
        <Text variant="caption" color={semantic.textMuted}>Lihat siapa yang sudah mulai shift hari ini.</Text>
        {rollQuery.isLoading ? <SkeletonList count={2} lines={2} /> : rollQuery.isError ? (
          <Card style={styles.stateCard}>
            <EmptyState icon="wifi-off" title="Gagal memuat daftar hadir" subtitle="Cek koneksi kamu, lalu coba lagi ya." tone="danger" />
            <Button label="Coba Lagi" icon="refresh" onPress={() => void rollQuery.refetch()} />
          </Card>
        ) : (
          <Card style={styles.card}>
            {roll.length === 0 ? <Text>Belum ada yang mulai shift hari ini.</Text> : roll.map((row) => (
              <View key={row.id} style={styles.rollRow}>
                <Text variant="bodyStrong" style={styles.rollText}>{row.user_name ?? `#${row.user_id}`}</Text>
                <Text variant="caption">{roleMeta[row.role].label} · {clockTime(row.clocked_in_at)}</Text>
              </View>
            ))}
          </Card>
        )}
      </Screen>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <Screen>
        <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
        <SkeletonList count={2} lines={2} />
      </Screen>
    );
  }

  if (statusQuery.isError || !status) {
    return (
      <Screen>
        <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
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

  return (
    <Screen refreshing={statusQuery.isRefetching} onRefresh={refresh}>
      <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
      <Text variant="h2">Absen</Text>
      <Text variant="caption" color={semantic.textMuted}>
        {status.operating_date}
      </Text>

      {/* The one big button. */}
      <Card style={styles.card}>
        {canAttend ? (
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
        ) : null}

        {banner ? <Banner tone="danger" message={banner} /> : null}

        {/*
          The location rule, stated before the button rather than discovered by being refused.
          Rendered only when something is actually enforced: a kitchen with no pin, an exempt
          cart, or the rule switched off all mean there is nothing here worth saying.
        */}
        {canAttend && !status.has_clocked_in && geofence?.enforced ? (
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
        {canAttend && !status.has_clocked_in && geofence?.basis === 'exempt' && geofence.exemption_reason ? (
          <Banner tone="info" message={`Izin absen luar lokasi berlaku: ${geofence.exemption_reason}`} />
        ) : null}

        {canAttend && !status.has_clocked_in ? (
          <Button
            label="Absen Sekarang"
            icon="fingerprint"
            // The fix is refreshed at the moment of pressing, not reused from arrival: somebody
            // who walked closer after being told they were too far must not be judged on where
            // they were standing a minute ago.
            onPress={clockInNow}
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
              message="Kopi sudah siap di showcase? Buka absen agar rider bisa mulai absen."
            />
            <Button
              label="Open Absen Rider"
              icon="lock-open-variant-outline"
              variant="secondary"
              onPress={openRiderAttendance}
              loading={openStaffAbsen.isPending}
              hint="Membuka absen untuk seluruh rider hari ini"
            />
          </Animated.View>
        ) : null}

        {canOpenKitchen && status.staff_window_open ? (
          <Banner tone="success" message="Absen rider sudah dibuka untuk hari ini." />
        ) : null}
      </Card>

      {/* Who is on shift. Ordinary shift information, so both roles see it. */}
      <SectionTitle title="Sudah absen hari ini" caption={`${roll.length} orang`} icon="account-group-outline" />
      <Card style={styles.card}>
        {roll.length === 0 ? (
          <EmptyState
            icon="account-clock-outline"
            title="Belum ada yang absen"
            subtitle="Produksi biasanya yang pertama, sebelum meracik kopi."
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
                      {roleMeta[row.role].label}
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

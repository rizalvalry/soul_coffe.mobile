import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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
import { brand, radius, semantic, space } from '@/theme';

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

export default function AbsenScreen() {
  const role = useAuth((s) => s.session?.user.role);
  const statusQuery = useAttendanceStatus();
  const rollQuery = useAttendanceRoll();
  const clockIn = useClockIn();
  const openStaffAbsen = useOpenStaffAbsen();

  const [banner, setBanner] = useState<string | null>(null);

  const status = statusQuery.data;
  const roll = rollQuery.data ?? [];

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

        {!status.has_clocked_in ? (
          <Button
            label="Absen Sekarang"
            icon="fingerprint"
            onPress={() => void act(() => clockIn.mutateAsync())}
            loading={clockIn.isPending}
            // Disabled state and its copy both come from the server — see the docblock.
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

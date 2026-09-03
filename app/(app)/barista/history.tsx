import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList, SkeletonCard } from '@/components/ui/Skeleton';
import { SectionTitle } from '@/components/ui/Section';
import { enter, listTransition } from '@/components/ui/Motion';
import { RefillCard } from '@/components/refill/RefillCard';
import { useRefills, useStaffOnShift } from '@/features/refill/queries';
import { semantic, space } from '@/theme';

const TERMINAL_STATUSES = ['READY_TO_PICK', 'PICKED_UP', 'DELIVERED', 'CLOSED'] as const;

/**
 * Prepared-request history is a real, server-scoped query (§2.1 — kitchen-scoped for BARISTA).
 *
 * Daily-allocation history has no backing endpoint yet: the API contract (docs/04) only exposes
 * `GET /allocations/today`, `GET /allocations/{id}` and `GET /me/allocation/today` — there is no
 * kitchen-wide allocation list. Rather than inventing a fetch call outside the reviewed contract,
 * this screen shows today's allocation status per staff (from the same source the allocation
 * screen uses) and says plainly that older days aren't available yet — the same "show the real
 * status" convention as `coming-soon.tsx`, not a silent gap.
 */
export default function BaristaHistoryScreen() {
  const refillsQuery = useRefills([...TERMINAL_STATUSES]);
  const staffQuery = useStaffOnShift();

  const prepared = [...(refillsQuery.data ?? [])].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
  );

  const refreshing = refillsQuery.isRefetching || staffQuery.isRefetching;
  const refresh = () => {
    void refillsQuery.refetch();
    void staffQuery.refetch();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Text variant="h2">Riwayat</Text>

      <View style={styles.section}>
        <SectionTitle title="Riwayat penyiapan" />

        {refillsQuery.isLoading ? (
          <SkeletonList count={2} lines={2} />
        ) : refillsQuery.isError ? (
          <Card>
            <EmptyState icon="wifi-off" title="Gagal memuat data" subtitle={(refillsQuery.error as Error).message} tone="danger" />
            <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void refillsQuery.refetch()} />
          </Card>
        ) : prepared.length === 0 ? (
          <Card>
            <EmptyState icon="clipboard-text-clock-outline" title="Belum ada riwayat" subtitle="Permintaan yang selesai disiapkan akan muncul di sini." />
          </Card>
        ) : (
          <View style={styles.list}>
            {prepared.map((r, index) => (
              // R15 — cost never shown to Barista.
              <RefillCard key={r.id} refill={r} showCost={false} index={index} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle title="Alokasi hari ini" />

        {staffQuery.isLoading ? (
          <SkeletonCard lines={3} />
        ) : staffQuery.isError ? (
          <Card>
            <EmptyState icon="wifi-off" title="Gagal memuat data" subtitle={(staffQuery.error as Error).message} tone="danger" />
            <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void staffQuery.refetch()} />
          </Card>
        ) : (staffQuery.data ?? []).length === 0 ? (
          <Card>
            <EmptyState icon="account-off-outline" title="Tidak ada staff bertugas" subtitle="Belum ada penugasan hari ini." />
          </Card>
        ) : (
          <Card style={styles.card}>
            {(staffQuery.data ?? []).map((s, index) => (
              <Animated.View key={s.staff_id} entering={enter('below', index, 6)} layout={listTransition} style={styles.staffRow}>
                <View style={styles.staffText}>
                  <Text variant="bodyStrong">{s.staff_name}</Text>
                  <Text variant="caption" color={semantic.textMuted}>
                    Gerobak {s.cart_code}
                  </Text>
                </View>
                <Chip tone={s.has_allocation ? 'brand' : 'amber'} label={s.has_allocation ? 'SUDAH' : 'BELUM'} />
              </Animated.View>
            ))}
          </Card>
        )}

        <Banner
          tone="info"
          message="Riwayat alokasi hari-hari sebelumnya belum tersedia — API saat ini hanya menyediakan status alokasi hari ini."
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  list: { gap: space.md },
  card: { gap: space.sm },
  staffRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.xs },
  staffText: { gap: space.xxs },
});

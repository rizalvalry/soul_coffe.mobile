import { FlatList, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConnectionBanner } from '@/components/ui/ConnectionBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { RefillCard } from '@/components/refill/RefillCard';
import { useRunnerAvailableController } from '@/features/refill/useRunnerAvailableController';
import { space } from '@/theme';

/**
 * Requirement 6 — the shared pickup pool. `claim` is an atomic single-winner transition (E2):
 * the loser gets a 409, never a silent double-claim.
 */
export default function RiderAvailableScreen() {
  const { refillsQuery, claimPending, realtime, onClaim, refresh, claimDisabled } = useRunnerAvailableController();

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <Card style={styles.header}>
        <Text variant="h2">Siap Diambil</Text>
        <ConnectionBanner state={realtime.state} />
      </Card>

      {refillsQuery.isLoading ? (
        <View style={styles.listPad}>
          <SkeletonList count={3} lines={2} />
        </View>
      ) : refillsQuery.isError ? (
        <View style={styles.center}>
          <EmptyState icon="wifi-off" title="Gagal memuat pesanan" subtitle={(refillsQuery.error as Error).message} tone="danger">
            <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={refresh} />
          </EmptyState>
        </View>
      ) : (
        <FlatList
          data={refillsQuery.data ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshing={refillsQuery.isRefetching}
          onRefresh={refresh}
          renderItem={({ item, index }) => (
            <View style={styles.item}>
              {/* R15 — cost never shown to Runner. */}
              <RefillCard refill={item} showCost={false} index={index} />
              <Button
                label="Ambil"
                icon="package-variant-closed"
                onPress={() => void onClaim(item)}
                disabled={claimDisabled(item)}
                loading={claimPending}
              />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState icon="package-variant" title="Belum ada pesanan siap" subtitle="Pesanan yang sudah disiapkan akan muncul di sini." />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  header: { margin: space.lg, marginBottom: space.md, gap: space.sm },
  listPad: { paddingHorizontal: space.lg },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space['2xl'], gap: space.lg },
  item: { gap: space.md },
});

import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConnectionBanner } from '@/components/ui/ConnectionBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { RefillCard } from '@/components/refill/RefillCard';
import { useClaimRefill, useRefills } from '@/features/refill/queries';
import { useRealtime } from '@/features/realtime/useRealtime';
import { ApiError } from '@/lib/api';
import type { RefillRequest } from '@/domain/types';
import { space } from '@/theme';

/**
 * Requirement 6 — the shared pickup pool. `claim` is an atomic single-winner transition (E2):
 * the loser gets a 409, never a silent double-claim.
 */
export default function RiderAvailableScreen() {
  const refillsQuery = useRefills('READY_TO_PICK');
  const claim = useClaimRefill();
  const realtime = useRealtime();

  const onClaim = async (refill: RefillRequest) => {
    try {
      await claim.mutateAsync({ id: refill.id });
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) {
        Alert.alert('Sudah diambil rider lain.');
        void refillsQuery.refetch();
      } else if (e instanceof ApiError) {
        Alert.alert('Gagal mengambil pesanan', e.message);
      }
    }
  };

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={styles.header}>
        <Text variant="h2">Siap Diambil</Text>
        <ConnectionBanner state={realtime.state} />
      </View>

      {refillsQuery.isLoading ? (
        <View style={styles.listPad}>
          <SkeletonList count={3} lines={2} />
        </View>
      ) : refillsQuery.isError ? (
        <View style={styles.center}>
          <EmptyState icon="wifi-off" title="Gagal memuat pesanan" subtitle={(refillsQuery.error as Error).message} tone="danger">
            <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void refillsQuery.refetch()} />
          </EmptyState>
        </View>
      ) : (
        <FlatList
          data={refillsQuery.data ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshing={refillsQuery.isRefetching}
          onRefresh={() => void refillsQuery.refetch()}
          renderItem={({ item, index }) => (
            <View style={styles.item}>
              {/* R15 — cost never shown to Rider. */}
              <RefillCard refill={item} showCost={false} index={index} />
              <Button
                label="Ambil"
                icon="package-variant-closed"
                onPress={() => void onClaim(item)}
                disabled={!item.can.claim}
                loading={claim.isPending}
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
  header: { padding: space.lg, gap: space.md },
  listPad: { paddingHorizontal: space.lg },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  item: { gap: space.sm },
});

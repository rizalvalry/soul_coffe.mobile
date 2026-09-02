import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConnectionBanner } from '@/components/ui/ConnectionBanner';
import { RefillCard } from '@/components/refill/RefillCard';
import { useClaimRefill, useRefills } from '@/features/refill/queries';
import { useRealtime } from '@/features/realtime/useRealtime';
import { ApiError } from '@/lib/api';
import type { RefillRequest } from '@/domain/types';
import { brand, feedback, semantic, space } from '@/theme';

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

  if (refillsQuery.isLoading) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={brand[700]} />
      </Screen>
    );
  }

  if (refillsQuery.isError) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <Card style={styles.stateCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={28} color={feedback.dangerFg} />
          <Text variant="bodyStrong" center>Gagal memuat pesanan</Text>
          <Text variant="caption" color={semantic.textMuted} center>
            {(refillsQuery.error as Error).message}
          </Text>
          <Button label="Coba Lagi" onPress={() => void refillsQuery.refetch()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={styles.header}>
        <Text variant="h2">Siap Diambil</Text>
        <ConnectionBanner state={realtime.state} />
      </View>

      <FlatList
        data={refillsQuery.data ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshing={refillsQuery.isRefetching}
        onRefresh={() => void refillsQuery.refetch()}
        renderItem={({ item }) => (
          <View style={styles.item}>
            {/* R15 — cost never shown to Rider. */}
            <RefillCard refill={item} showCost={false} />
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
          <Card style={styles.stateCard}>
            <Text variant="caption" color={semantic.textMuted} center>
              Tidak ada pesanan yang siap diambil saat ini.
            </Text>
          </Card>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { padding: space.lg, gap: space.md },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  item: { gap: space.sm },
  stateCard: { gap: space.md, alignItems: 'center', margin: space.lg },
});

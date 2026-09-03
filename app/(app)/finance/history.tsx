import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { RefillCard } from '@/components/refill/RefillCard';
import { useRefills } from '@/features/refill/queries';
import { radius, semantic, space } from '@/theme';
import type { RefillRequest, RefillStatus } from '@/domain/types';

/** Every terminal-or-in-flight status except SUBMITTED — a decision has already been made. */
const DECIDED_STATUSES: RefillStatus[] = [
  'APPROVED',
  'REJECTED',
  'PREPARING',
  'READY_TO_PICK',
  'PICKED_UP',
  'DELIVERED',
  'CLOSED',
  'CANCELLED',
  'EXPIRED',
];

export default function FinanceHistoryScreen() {
  const router = useRouter();
  const refillsQuery = useRefills(DECIDED_STATUSES);
  const rows = refillsQuery.data ?? [];

  return (
    <Screen scroll={false}>
      <View style={styles.page}>
        <View style={styles.header}>
          <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
          <Text variant="h2">Riwayat Approval</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Semua keputusan beserta alasannya
          </Text>
        </View>

        {refillsQuery.isLoading ? (
          <View style={styles.listPad}>
            <SkeletonList count={4} lines={2} />
          </View>
        ) : refillsQuery.isError ? (
          <View style={styles.center}>
            <EmptyState
              icon="wifi-off"
              title="Gagal memuat riwayat"
              subtitle="Periksa koneksi internet Anda."
              tone="danger"
            >
              <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void refillsQuery.refetch()} />
            </EmptyState>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={rows}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.listContent}
            refreshing={refillsQuery.isRefetching}
            onRefresh={() => void refillsQuery.refetch()}
            renderItem={({ item, index }: { item: RefillRequest; index: number }) => (
              <View style={styles.itemCard}>
                <RefillCard refill={item} showCost index={index} />
                {item.decision_reason ? (
                  <View style={styles.reasonBox}>
                    <Text variant="caption" color={semantic.textMuted}>
                      Alasan: {item.decision_reason}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
            ListEmptyComponent={
              <EmptyState
                icon="text-box-check-outline"
                title="Belum ada keputusan"
                subtitle="Permintaan yang sudah diputuskan akan muncul di sini."
              />
            }
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { padding: space.lg, gap: space.xxs },
  listPad: { paddingHorizontal: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  list: { flex: 1 },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  itemCard: { gap: space.sm },
  reasonBox: {
    backgroundColor: semantic.surfaceSunken,
    borderRadius: radius.md,
    padding: space.md,
  },
});

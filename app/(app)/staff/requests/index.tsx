import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { RefillCard } from '@/components/refill/RefillCard';
import { useRefills } from '@/features/refill/queries';
import { useRealtime } from '@/features/realtime/useRealtime';
import { semantic, space } from '@/theme';
import type { RefillRequest } from '@/domain/types';

/** requirement 3 — status updates with no reload. */
export default function StaffRequestsScreen() {
  const router = useRouter();
  const refillsQuery = useRefills();
  const { isRealtime } = useRealtime();

  return (
    <Screen scroll={false}>
      <View style={styles.page}>
        <View style={styles.header}>
          <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
          <Text variant="h2">Status Permintaan</Text>
          <Text variant="caption" color={semantic.textMuted}>
            {isRealtime ? 'Realtime aktif' : 'Menyinkronkan secara berkala'}
          </Text>
        </View>

        {refillsQuery.isLoading ? (
          <View style={styles.listPad}>
            <SkeletonList count={4} lines={2} />
          </View>
        ) : refillsQuery.isError ? (
          <View style={styles.center}>
            <EmptyState icon="wifi-off" title="Gagal memuat data" subtitle="Tarik ke bawah untuk mencoba lagi." tone="danger">
              <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void refillsQuery.refetch()} />
            </EmptyState>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={refillsQuery.data ?? []}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.listContent}
            refreshing={refillsQuery.isRefetching}
            onRefresh={() => void refillsQuery.refetch()}
            renderItem={({ item, index }: { item: RefillRequest; index: number }) => (
              <RefillCard refill={item} showCost={false} index={index} onPress={() => router.push(`/staff/requests/${item.id}`)} />
            )}
            ListEmptyComponent={
              <EmptyState
                icon="clipboard-text-off-outline"
                title="Belum ada permintaan"
                subtitle="Permintaan refill yang Anda ajukan akan muncul di sini."
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
});

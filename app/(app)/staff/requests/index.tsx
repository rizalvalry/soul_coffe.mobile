import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
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

  const onRefresh = useCallback(() => {
    void refillsQuery.refetch();
  }, [refillsQuery]);

  const renderItem = useCallback(
    ({ item }: { item: RefillRequest }) => (
      <RefillCard
        refill={item}
        showCost={false}
        onPress={() => router.push(`/staff/requests/${item.id}`)}
      />
    ),
    [router],
  );

  return (
    <Screen scroll={false}>
      <View style={styles.page}>
        <View style={styles.header}>
          <Button
            label="Kembali"
            icon="chevron-left"
            variant="ghost"
            fullWidth={false}
            onPress={() => router.back()}
          />
          <Text variant="h2">Status Permintaan</Text>
          <Text variant="caption" color={semantic.textMuted}>
            {isRealtime ? 'Realtime aktif' : 'Menyinkronkan secara berkala'}
          </Text>
        </View>

        {refillsQuery.isLoading ? (
          <View style={styles.center}>
            <Text color={semantic.textMuted}>Memuat permintaan...</Text>
          </View>
        ) : refillsQuery.isError ? (
          <View style={styles.center}>
            <EmptyState
              icon="alert-circle-outline"
              title="Gagal memuat data"
              subtitle="Tarik ke bawah untuk mencoba lagi."
            />
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={refillsQuery.data ?? []}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refillsQuery.isRefetching} onRefresh={onRefresh} />
            }
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  list: { flex: 1 },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
});

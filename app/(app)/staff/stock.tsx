import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMyStock } from '@/features/refill/queries';
import { semantic, space } from '@/theme';
import type { CartStockRow } from '@/domain/types';

export default function StaffStockScreen() {
  const router = useRouter();
  const stockQuery = useMyStock();
  const rows = stockQuery.data ?? [];

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
          <Text variant="h2">Stok Gerobak</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Sisa cups per produk saat ini
          </Text>
        </View>

        {stockQuery.isLoading ? (
          <View style={styles.center}>
            <Text color={semantic.textMuted}>Memuat stok...</Text>
          </View>
        ) : stockQuery.isError ? (
          <View style={styles.center}>
            <EmptyState
              icon="alert-circle-outline"
              title="Gagal memuat stok"
              subtitle="Periksa koneksi internet Anda."
            />
            <Button label="Coba Lagi" variant="secondary" onPress={() => void stockQuery.refetch()} />
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={rows}
            keyExtractor={(item) => String(item.product_id)}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={stockQuery.isRefetching} onRefresh={() => void stockQuery.refetch()} />
            }
            ListHeaderComponent={
              rows.length > 0 ? (
                <View style={styles.tableHead}>
                  <Text variant="micro" color={semantic.textSubtle} style={styles.colName}>
                    PRODUK
                  </Text>
                  <Text variant="micro" color={semantic.textSubtle} style={styles.colQty}>
                    STOK
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }: { item: CartStockRow }) => (
              <View style={styles.row}>
                <Text variant="body" style={styles.colName}>
                  {item.product_name}
                </Text>
                <Text variant="bodyStrong" style={styles.colQty}>
                  {item.on_hand} {item.unit}
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <EmptyState
                icon="cup-outline"
                title="Belum ada stok tercatat"
                subtitle="Stok akan muncul setelah alokasi atau refill pertama diterima."
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  list: { flex: 1 },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  tableHead: {
    flexDirection: 'row',
    gap: space.sm,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  colName: { flex: 2 },
  colQty: { flex: 1, textAlign: 'right' },
});

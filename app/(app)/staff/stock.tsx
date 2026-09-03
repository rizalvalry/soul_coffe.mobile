import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useMyStock } from '@/features/refill/queries';
import { brand, radius, semantic, shadow, space } from '@/theme';
import type { CartStockRow } from '@/domain/types';

export default function StaffStockScreen() {
  const router = useRouter();
  const stockQuery = useMyStock();
  const rows = stockQuery.data ?? [];

  return (
    <Screen scroll={false}>
      <View style={styles.page}>
        <View style={styles.header}>
          <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
          <Text variant="h2">Stok Gerobak</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Sisa cups per produk saat ini
          </Text>
        </View>

        {stockQuery.isLoading ? (
          <View style={styles.listPad}>
            <SkeletonList count={5} lines={0} />
          </View>
        ) : stockQuery.isError ? (
          <View style={styles.center}>
            <EmptyState icon="wifi-off" title="Gagal memuat stok" subtitle="Periksa koneksi internet Anda." tone="danger">
              <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void stockQuery.refetch()} />
            </EmptyState>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={rows}
            keyExtractor={(item) => String(item.product_id)}
            contentContainerStyle={styles.listContent}
            refreshing={stockQuery.isRefetching}
            onRefresh={() => void stockQuery.refetch()}
            renderItem={({ item }: { item: CartStockRow }) => (
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Text variant="micro" color={brand[700]}>
                    {item.product_name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text variant="body" style={styles.colName} numberOfLines={1}>
                  {item.product_name}
                </Text>
                <View style={styles.qtyPill}>
                  <Text variant="bodyStrong" color={brand[700]}>
                    {item.on_hand}
                  </Text>
                  <Text variant="caption" color={semantic.textMuted}>
                    {item.unit}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <EmptyState icon="cup-outline" title="Belum ada stok tercatat" subtitle="Stok akan muncul setelah alokasi atau refill pertama diterima." />
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
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    ...shadow.card,
  },
  rowIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: brand[50], alignItems: 'center', justifyContent: 'center' },
  colName: { flex: 1 },
  qtyPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xxs,
    backgroundColor: brand[50],
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
});

import { FlatList, Image, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useKitchenStock, useProducts } from '@/features/refill/queries';
import { productImageSource } from '@/domain/productImages';
import { brand, radius, semantic, shadow, space } from '@/theme';

/**
 * `on_hand` is a projection over the append-only stock ledger (R6) — never edited here, only
 * displayed. There is no write path on this screen by design.
 */
export default function BaristaStockScreen() {
  const stockQuery = useKitchenStock();
  const productsQuery = useProducts();
  const rows = stockQuery.data ?? [];
  const productById = new Map((productsQuery.data ?? []).map((product) => [product.id, product]));

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <Text variant="h2" style={styles.header}>
        Stok Dapur
      </Text>

      {stockQuery.isLoading ? (
        <View style={styles.listPad}>
          <SkeletonList count={5} lines={0} />
        </View>
      ) : stockQuery.isError ? (
        <View style={styles.center}>
          <EmptyState icon="wifi-off" title="Gagal memuat stok dapur" subtitle={(stockQuery.error as Error).message} tone="danger">
            <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void stockQuery.refetch()} />
          </EmptyState>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => String(row.product_id)}
          contentContainerStyle={styles.listContent}
          refreshing={stockQuery.isRefetching || productsQuery.isRefetching}
          onRefresh={() => {
            void stockQuery.refetch();
            void productsQuery.refetch();
          }}
          renderItem={({ item }) => {
            const image = productImageSource(productById.get(item.product_id) ?? {});
            return (
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  {image ? <Image source={image} style={styles.rowImage} /> : (
                    <Text variant="micro" color={brand[700]}>
                      {item.product_name.slice(0, 1).toUpperCase()}
                    </Text>
                  )}
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
            );
          }}
          ListEmptyComponent={
            <EmptyState icon="fridge-outline" title="Belum ada data stok dapur" subtitle="Data akan muncul setelah alokasi pertama tercatat." />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  header: { padding: space.lg, paddingBottom: space.sm },
  listPad: { paddingHorizontal: space.lg },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
    ...shadow.card,
  },
  rowIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: brand[50], alignItems: 'center', justifyContent: 'center' },
  rowImage: { width: 36, height: 36, borderRadius: radius.md },
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

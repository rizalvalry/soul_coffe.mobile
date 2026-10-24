import { FlatList, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { enter } from '@/components/ui/Motion';
import { ProductThumbnail } from '@/components/ui/ProductThumbnail';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useKitchenStock, useProducts } from '@/features/refill/queries';
import { brand, productColor, radius, semantic, space } from '@/theme';

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
      <Text variant="display" style={styles.header}>
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
          renderItem={({ item, index }) => {
            const tone = productColor[item.product_name as keyof typeof productColor] ?? { bg: brand[50], fg: brand[700] };
            return (
              <Animated.View entering={enter('below', index)}>
                <Card style={styles.row}>
                  <ProductThumbnail product={productById.get(item.product_id) ?? { product_name: item.product_name }} size={48} />
                  <Text variant="bodyStrong" style={styles.colName} numberOfLines={1}>
                    {item.product_name}
                  </Text>
                  <View style={[styles.qtyPill, { backgroundColor: tone.bg }]}>
                    <Text variant="bodyStrong" color={tone.fg}>
                      {item.on_hand}
                    </Text>
                    <Text variant="caption" color={semantic.textMuted}>
                      {item.unit}
                    </Text>
                  </View>
                </Card>
              </Animated.View>
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
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  listPad: { paddingHorizontal: space.lg },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space['2xl'], gap: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.card,
    padding: space.md,
  },
  colName: { flex: 1 },
  qtyPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xxs,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
});

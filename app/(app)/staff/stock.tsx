import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ProductThumbnail } from '@/components/ui/ProductThumbnail';
import { enter } from '@/components/ui/Motion';
import { useMyStock, useProducts } from '@/features/refill/queries';
import { brand, neutral, productColor, radius, semantic, shadow, space } from '@/theme';
import type { CartStockRow } from '@/domain/types';

export default function StaffStockScreen() {
  const router = useRouter();
  const stockQuery = useMyStock();
  const productsQuery = useProducts();
  const rows = stockQuery.data ?? [];
  const productById = new Map((productsQuery.data ?? []).map((product) => [product.id, product]));

  return (
    <Screen scroll={false}>
      <View style={styles.page}>
        <View style={styles.header}>
          <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
          <Text variant="h2">Stok Coffee Bike</Text>
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
            refreshing={stockQuery.isRefetching || productsQuery.isRefetching}
            onRefresh={() => {
              void stockQuery.refetch();
              void productsQuery.refetch();
            }}
            renderItem={({ item, index }: { item: CartStockRow; index: number }) => {
              const tone = productColor[item.product_name as keyof typeof productColor] ?? { bg: brand[50], fg: brand[700] };
              return (
                <Animated.View entering={enter('below', index)} style={[styles.row, { backgroundColor: tone.bg }]}>
                  <ProductThumbnail product={{ product_name: item.product_name, image_url: productById.get(item.product_id)?.image_url }} size={48} />
                  <Text variant="bodyStrong" color={tone.fg} style={styles.colName} numberOfLines={1}>
                    {item.product_name}
                  </Text>
                  <View style={styles.qtyPill}>
                    <Text variant="bodyStrong" color={tone.fg}>
                      {item.on_hand}
                    </Text>
                    <Text variant="caption" color={semantic.textMuted}>
                      {item.unit}
                    </Text>
                  </View>
                </Animated.View>
              );
            }}
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
  header: { padding: space.lg, gap: space.xs },
  listPad: { paddingHorizontal: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  list: { flex: 1 },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.card,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    ...shadow.card,
  },
  colName: { flex: 1 },
  qtyPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xxs,
    backgroundColor: neutral[0],
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
});

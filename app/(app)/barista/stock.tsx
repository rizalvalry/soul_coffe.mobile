import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useKitchenStock } from '@/features/refill/queries';
import { brand, feedback, semantic, space } from '@/theme';

/**
 * `on_hand` is a projection over the append-only stock ledger (R6) — never edited here, only
 * displayed. There is no write path on this screen by design.
 */
export default function BaristaStockScreen() {
  const stockQuery = useKitchenStock();

  if (stockQuery.isLoading) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={brand[700]} />
      </Screen>
    );
  }

  if (stockQuery.isError) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <Card style={styles.stateCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={28} color={feedback.dangerFg} />
          <Text variant="bodyStrong" center>Gagal memuat stok dapur</Text>
          <Text variant="caption" color={semantic.textMuted} center>
            {(stockQuery.error as Error).message}
          </Text>
          <Button label="Coba Lagi" onPress={() => void stockQuery.refetch()} />
        </Card>
      </Screen>
    );
  }

  const rows = stockQuery.data ?? [];

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <Text variant="h2" style={styles.header}>Stok Dapur</Text>
      <FlatList
        data={rows}
        keyExtractor={(row) => String(row.product_id)}
        contentContainerStyle={styles.listContent}
        refreshing={stockQuery.isRefetching}
        onRefresh={() => void stockQuery.refetch()}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text variant="body">{item.product_name}</Text>
            <Text variant="bodyStrong">{item.on_hand} {item.unit}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Card style={styles.stateCard}>
            <Text variant="caption" color={semantic.textMuted} center>
              Belum ada data stok dapur.
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
  header: { padding: space.lg, paddingBottom: space.sm },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md },
  separator: { height: 1, backgroundColor: semantic.border },
  stateCard: { gap: space.md, alignItems: 'center' },
});

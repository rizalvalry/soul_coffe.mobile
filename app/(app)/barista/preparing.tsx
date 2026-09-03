import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { StatusBadge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useMarkReady, useRefills } from '@/features/refill/queries';
import { ApiError } from '@/lib/api';
import type { RefillRequest } from '@/domain/types';
import { semantic, space } from '@/theme';

/** One request's own prepare-quantities form. Kept local so each card manages independent state
 * without a shared map keyed by request id. */
function PreparingCard({ refill }: { refill: RefillRequest }) {
  const markReady = useMarkReady();
  const [qty, setQty] = useState<Record<number, number>>(() =>
    Object.fromEntries(refill.lines.map((l) => [l.id, l.qty_approved ?? 0])),
  );
  const [shortfallReason, setShortfallReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasShortfall = refill.lines.some((l) => (qty[l.id] ?? 0) < (l.qty_approved ?? 0));

  const onSubmit = async () => {
    setError(null);
    if (hasShortfall && shortfallReason.trim().length === 0) {
      setError('Alasan kekurangan wajib diisi karena ada jumlah yang kurang dari yang disetujui.');
      return;
    }
    try {
      await markReady.mutateAsync({
        id: refill.id,
        lines: refill.lines.map((l) => ({ line_id: l.id, qty_prepared: qty[l.id] ?? 0 })),
        ...(hasShortfall ? { shortfallReason: shortfallReason.trim() } : {}),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan tidak terduga.');
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={styles.topText}>
          <Text variant="h3">{refill.code}</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Gerobak {refill.cart_code} · {refill.staff_name}
          </Text>
        </View>
        <StatusBadge status={refill.status} />
      </View>

      <View style={styles.lines}>
        {refill.lines.map((line) => (
          <View key={line.id} style={styles.lineRow}>
            <View style={styles.lineText}>
              <Text variant="body" numberOfLines={1}>
                {line.product_name}
              </Text>
            </View>
            <QtyStepper
              value={qty[line.id] ?? 0}
              onChange={(next) => setQty((prev) => ({ ...prev, [line.id]: next }))}
              max={line.qty_approved ?? 0}
              capHint={`maks. ${line.qty_approved ?? 0} (disetujui)`}
            />
          </View>
        ))}
      </View>

      {hasShortfall ? (
        <Input
          label="Alasan Kekurangan"
          value={shortfallReason}
          onChangeText={setShortfallReason}
          multiline
          numberOfLines={2}
          placeholder="Contoh: stok gula habis di dapur"
        />
      ) : null}

      {error ? <Banner message={error} tone="danger" /> : null}

      <Button label="Siap Diambil" icon="check-circle-outline" onPress={() => void onSubmit()} loading={markReady.isPending} />
    </Card>
  );
}

export default function BaristaPreparingScreen() {
  const refillsQuery = useRefills('PREPARING');

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <Text variant="h2" style={styles.header}>
        Siapkan Pesanan
      </Text>

      {refillsQuery.isLoading ? (
        <View style={styles.listPad}>
          <SkeletonList count={3} lines={2} />
        </View>
      ) : refillsQuery.isError ? (
        <View style={styles.center}>
          <EmptyState icon="wifi-off" title="Gagal memuat data" subtitle={(refillsQuery.error as Error).message} tone="danger">
            <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void refillsQuery.refetch()} />
          </EmptyState>
        </View>
      ) : (
        <FlatList
          data={refillsQuery.data ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshing={refillsQuery.isRefetching}
          onRefresh={() => void refillsQuery.refetch()}
          renderItem={({ item }) => <PreparingCard refill={item} />}
          ListEmptyComponent={
            <EmptyState
              icon="coffee-maker-outline"
              title="Tidak ada pesanan disiapkan"
              subtitle="Pesanan muncul di sini setelah disetujui Finance."
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  header: { padding: space.lg, paddingBottom: 0 },
  listPad: { paddingHorizontal: space.lg },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  listContent: { padding: space.lg, gap: space.md },
  card: { gap: space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  topText: { flex: 1, gap: space.xxs },
  lines: { gap: space.md },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  lineText: { flex: 1 },
});

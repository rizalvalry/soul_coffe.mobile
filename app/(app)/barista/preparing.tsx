import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { StatusBadge } from '@/components/ui/Badge';
import { useMarkReady, useRefills } from '@/features/refill/queries';
import { ApiError } from '@/lib/api';
import type { RefillRequest } from '@/domain/types';
import { brand, feedback, radius, semantic, space } from '@/theme';

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
          <Text variant="bodyStrong">{refill.code}</Text>
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
              <Text variant="body">{line.product_name}</Text>
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

      {error ? (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={feedback.dangerFg} />
          <Text variant="caption" color={feedback.dangerFg} style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Button label="Siap Diambil" onPress={() => void onSubmit()} loading={markReady.isPending} />
    </Card>
  );
}

export default function BaristaPreparingScreen() {
  const refillsQuery = useRefills('PREPARING');

  if (refillsQuery.isLoading) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={brand[700]} />
      </Screen>
    );
  }

  if (refillsQuery.isError) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <Card style={styles.stateCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={28} color={feedback.dangerFg} />
          <Text variant="bodyStrong" center>Gagal memuat data</Text>
          <Text variant="caption" color={semantic.textMuted} center>
            {(refillsQuery.error as Error).message}
          </Text>
          <Button label="Coba Lagi" onPress={() => void refillsQuery.refetch()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <Text variant="h2" style={styles.header}>Siapkan Pesanan</Text>
      <FlatList
        data={refillsQuery.data ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshing={refillsQuery.isRefetching}
        onRefresh={() => void refillsQuery.refetch()}
        renderItem={({ item }) => <PreparingCard refill={item} />}
        ListEmptyComponent={
          <Card style={styles.stateCard}>
            <Text variant="caption" color={semantic.textMuted} center>
              Tidak ada pesanan yang sedang disiapkan. Pesanan muncul di sini setelah disetujui Finance.
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
  header: { padding: space.lg, paddingBottom: 0 },
  listContent: { padding: space.lg, gap: space.md },
  card: { gap: space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  topText: { flex: 1, gap: space.xxs },
  lines: { gap: space.md },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  lineText: { flex: 1 },
  errorBanner: { flexDirection: 'row', gap: space.sm, backgroundColor: feedback.dangerBg, borderColor: feedback.dangerBorder, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  errorText: { flex: 1 },
  stateCard: { gap: space.md, alignItems: 'center' },
});

import { FlatList, Image, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { RefillCard, formatTime } from '@/components/refill/RefillCard';
import { useRefills } from '@/features/refill/queries';
import { neutral, radius, semantic, space, touch } from '@/theme';

/** Completed deliveries, newest first, each with the signature captured at handover (R5). */
export default function RiderHistoryScreen() {
  const refillsQuery = useRefills(['DELIVERED', 'CLOSED']);

  const rows = [...(refillsQuery.data ?? [])].sort(
    (a, b) => new Date(b.delivered_at ?? b.submitted_at).getTime() - new Date(a.delivered_at ?? a.submitted_at).getTime(),
  );

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <Text variant="h2" style={styles.header}>
        Riwayat Pengiriman
      </Text>

      {refillsQuery.isLoading ? (
        <View style={styles.listPad}>
          <SkeletonList count={3} lines={2} />
        </View>
      ) : refillsQuery.isError ? (
        <View style={styles.center}>
          <EmptyState icon="wifi-off" title="Gagal memuat riwayat" subtitle={(refillsQuery.error as Error).message} tone="danger">
            <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void refillsQuery.refetch()} />
          </EmptyState>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshing={refillsQuery.isRefetching}
          onRefresh={() => void refillsQuery.refetch()}
          renderItem={({ item, index }) => (
            <View style={styles.item}>
              {/* R15 — cost never shown to Rider. */}
              <RefillCard refill={item} showCost={false} index={index} />

              <Card style={styles.signatureCard}>
                <View style={styles.signatureHeader}>
                  <MaterialCommunityIcons name="draw-pen" size={16} color={semantic.textMuted} />
                  <Text variant="caption" color={semantic.textMuted}>
                    Diterima {formatTime(item.delivered_at)} · {item.signature_method === 'pin_fallback' ? 'Verifikasi PIN' : 'Paraf Staff'}
                  </Text>
                </View>
                {item.signature_url ? (
                  <Image source={{ uri: item.signature_url }} style={styles.signatureImage} resizeMode="contain" />
                ) : (
                  <Text variant="caption" color={semantic.textSubtle}>
                    Bukti tanda tangan tidak tersedia.
                  </Text>
                )}
              </Card>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState icon="clipboard-text-clock-outline" title="Belum ada pengiriman selesai" subtitle="Riwayat pengiriman Anda akan muncul di sini." />
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
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  item: { gap: space.sm },
  signatureCard: { gap: space.sm },
  signatureHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  signatureImage: { width: '100%', height: touch.tileMinHeight * 1.25, borderRadius: radius.sm, backgroundColor: neutral[0] },
});

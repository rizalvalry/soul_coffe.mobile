import { ActivityIndicator, FlatList, Image, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { RefillCard, formatTime } from '@/components/refill/RefillCard';
import { useRefills } from '@/features/refill/queries';
import { brand, feedback, neutral, radius, semantic, space, touch } from '@/theme';

/** Completed deliveries, newest first, each with the signature captured at handover (R5). */
export default function RiderHistoryScreen() {
  const refillsQuery = useRefills(['DELIVERED', 'CLOSED']);

  const rows = [...(refillsQuery.data ?? [])].sort(
    (a, b) => new Date(b.delivered_at ?? b.submitted_at).getTime() - new Date(a.delivered_at ?? a.submitted_at).getTime(),
  );

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
          <Text variant="bodyStrong" center>Gagal memuat riwayat</Text>
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
      <Text variant="h2" style={styles.header}>Riwayat Pengiriman</Text>

      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshing={refillsQuery.isRefetching}
        onRefresh={() => void refillsQuery.refetch()}
        renderItem={({ item }) => (
          <View style={styles.item}>
            {/* R15 — cost never shown to Rider. */}
            <RefillCard refill={item} showCost={false} />

            <Card style={styles.signatureCard}>
              <View style={styles.signatureHeader}>
                <MaterialCommunityIcons name="draw-pen" size={16} color={semantic.textMuted} />
                <Text variant="caption" color={semantic.textMuted}>
                  Diterima {formatTime(item.delivered_at)} ·{' '}
                  {item.signature_method === 'pin_fallback' ? 'Verifikasi PIN' : 'Paraf Staff'}
                </Text>
              </View>
              {item.signature_url ? (
                <Image source={{ uri: item.signature_url }} style={styles.signatureImage} resizeMode="contain" />
              ) : (
                <Text variant="caption" color={semantic.textSubtle}>Bukti tanda tangan tidak tersedia.</Text>
              )}
            </Card>
          </View>
        )}
        ListEmptyComponent={
          <Card style={styles.stateCard}>
            <Text variant="caption" color={semantic.textMuted} center>
              Belum ada pengiriman yang selesai.
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
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  item: { gap: space.sm },
  signatureCard: { gap: space.sm },
  signatureHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  signatureImage: { width: '100%', height: touch.tileMinHeight * 1.25, borderRadius: radius.sm, backgroundColor: neutral[0] },
  stateCard: { gap: space.md, alignItems: 'center' },
});

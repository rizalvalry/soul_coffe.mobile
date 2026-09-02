import { useMemo } from 'react';
import { ActivityIndicator, Alert, SectionList, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConnectionBanner } from '@/components/ui/ConnectionBanner';
import { RefillCard } from '@/components/refill/RefillCard';
import { useRefills, useStartPreparing } from '@/features/refill/queries';
import { useRealtime } from '@/features/realtime/useRealtime';
import { ApiError } from '@/lib/api';
import type { RefillRequest, RefillStatus } from '@/domain/types';
import { brand, feedback, semantic, space } from '@/theme';

type Section = { key: RefillStatus; title: string; data: RefillRequest[] };

const SECTION_ORDER: { key: RefillStatus; title: string }[] = [
  { key: 'SUBMITTED', title: 'Menunggu Approval Finance' },
  { key: 'APPROVED', title: 'Siap Disiapkan' },
  { key: 'PREPARING', title: 'Sedang Disiapkan' },
];

/**
 * The most subtle screen in the app: requirement 2 (barista sees the request immediately) and
 * requirement 4 (barista cannot start until Finance approves) must both be true at once.
 *
 * Visibility is unconditional — every SUBMITTED/APPROVED/PREPARING request renders. Capability
 * is driven ENTIRELY by `refill.can.start_preparing`, which the server computes. A `SUBMITTED`
 * request is read-only by construction (the flag is false), never by a client-side status check.
 */
export default function BaristaRequestsScreen() {
  const refillsQuery = useRefills(['SUBMITTED', 'APPROVED', 'PREPARING']);
  const startPreparing = useStartPreparing();
  const realtime = useRealtime();

  const sections: Section[] = useMemo(() => {
    const data = refillsQuery.data ?? [];
    return SECTION_ORDER.map((s) => ({
      ...s,
      data: data.filter((r) => r.status === s.key),
    })).filter((s) => s.data.length > 0);
  }, [refillsQuery.data]);

  const onStartPreparing = async (refill: RefillRequest) => {
    try {
      await startPreparing.mutateAsync({ id: refill.id });
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) {
        // The server correctly enforcing R1 — the disabled button was convenience, this is the gate.
        Alert.alert('Belum disetujui Finance.');
        void refillsQuery.refetch();
      } else if (e instanceof ApiError) {
        Alert.alert('Gagal memulai penyiapan', e.message);
      }
    }
  };

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
          <Text variant="bodyStrong" center>Gagal memuat permintaan</Text>
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
      <View style={styles.header}>
        <Text variant="h2">Permintaan Refill</Text>
        <ConnectionBanner state={realtime.state} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshing={refillsQuery.isRefetching}
        onRefresh={() => void refillsQuery.refetch()}
        renderSectionHeader={({ section }) => (
          <Text variant="micro" color={semantic.textSubtle} style={styles.sectionTitle}>
            {section.title.toUpperCase()}
          </Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.item}>
            {/* R15 — cost is never shown to the barista. */}
            <RefillCard refill={item} showCost={false} />

            {item.status === 'PREPARING' ? (
              <Text variant="caption" color={semantic.textMuted} style={styles.hint}>
                Lanjutkan di layar Siapkan Pesanan.
              </Text>
            ) : (
              <Button
                label="Siapkan"
                onPress={() => void onStartPreparing(item)}
                disabled={!item.can.start_preparing}
                loading={startPreparing.isPending}
              />
            )}
          </View>
        )}
        ListEmptyComponent={
          <Card style={styles.stateCard}>
            <Text variant="caption" color={semantic.textMuted} center>
              Belum ada permintaan refill masuk.
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
  header: { padding: space.lg, gap: space.md },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  sectionTitle: { letterSpacing: 1, marginTop: space.md, marginBottom: space.xs },
  item: { gap: space.sm, marginBottom: space.sm },
  hint: { paddingHorizontal: space.xs },
  stateCard: { gap: space.md, alignItems: 'center', margin: space.lg },
});

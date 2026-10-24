import { SectionList, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConnectionBanner } from '@/components/ui/ConnectionBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Chip } from '@/components/ui/Badge';
import { RefillCard } from '@/components/refill/RefillCard';
import { useRequestsController } from '@/features/showcase/useRequestsController';
import { radius, semantic, space } from '@/theme';

/**
 * The most subtle screen in the app: requirement 2 (barista sees the request immediately) and
 * requirement 4 (barista cannot start until Finance approves) must both be true at once.
 *
 * Visibility is unconditional — every SUBMITTED/APPROVED/PREPARING request renders. Capability
 * is driven ENTIRELY by `refill.can.start_preparing`, which the server computes. A `SUBMITTED`
 * request is read-only by construction (the flag is false), never by a client-side status check.
 */
export default function BaristaRequestsScreen() {
  const { refillsQuery, startPreparing, realtime, sections, onStartPreparing } = useRequestsController();

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={styles.header}>
        <Text variant="display">Permintaan Refill</Text>
        <ConnectionBanner state={realtime.state} />
      </View>

      {refillsQuery.isLoading ? (
        <View style={styles.listPad}>
          <SkeletonList count={3} lines={2} />
        </View>
      ) : refillsQuery.isError ? (
        <View style={styles.center}>
          <EmptyState icon="wifi-off" title="Gagal memuat permintaan" subtitle={(refillsQuery.error as Error).message} tone="danger">
            <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void refillsQuery.refetch()} />
          </EmptyState>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          refreshing={refillsQuery.isRefetching}
          onRefresh={() => void refillsQuery.refetch()}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Chip label={section.title.toUpperCase()} tone={section.key === 'APPROVED' ? 'amber' : 'brand'} />
            </View>
          )}
          renderItem={({ item, index }) => (
            <View style={styles.item}>
              {/* R15 — cost is never shown to the barista. */}
              <RefillCard refill={item} showCost={false} index={index} />

              {item.status === 'PREPARING' ? (
                <Text variant="caption" color={semantic.textMuted} style={styles.hint}>
                  Lanjutkan di layar Siapkan Pesanan.
                </Text>
              ) : (
                <Button
                  label="Siapkan"
                  icon="coffee-maker-outline"
                  onPress={() => void onStartPreparing(item)}
                  disabled={!item.can.start_preparing}
                  loading={startPreparing.isPending}
                />
              )}
            </View>
          )}
          ListEmptyComponent={
            <EmptyState icon="bell-off-outline" title="Belum ada permintaan masuk" subtitle="Permintaan refill dari rider akan muncul di sini." />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md, gap: space.sm },
  listPad: { paddingHorizontal: space.lg },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space['2xl'] },
  sectionHeader: { alignItems: 'flex-start', marginTop: space.md, marginBottom: space.md },
  item: { gap: space.sm, marginBottom: space.lg, borderRadius: radius.card },
  hint: { paddingHorizontal: space.md },
});

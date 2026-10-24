import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConnectionBanner } from '@/components/ui/ConnectionBanner';
import { Banner } from '@/components/ui/Banner';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ProductThumbnail } from '@/components/ui/ProductThumbnail';
import { MetaRow } from '@/components/ui/Section';
import { RefillCard, formatRupiah } from '@/components/refill/RefillCard';
import { useFinanceApprovalCard, useFinanceApprovalQueue } from '@/features/refill/approvalController';
import { neutral, radius, semantic, space } from '@/theme';
import type { RefillRequest } from '@/domain/types';

/**
 * requirement 4 — the approval gate the whole state machine hinges on (R1).
 *
 * This is the single most time-sensitive screen in the app: nothing downstream (barista prep,
 * runner pickup, delivery) can move until a SUBMITTED request is decided here. It must not rely
 * on the operator remembering to pull-to-refresh. `RealtimeProvider` subscribes while signed in
 * and refreshes active queries after a reconnect or foreground return.
 */
export default function FinanceApprovalsScreen() {
  const router = useRouter();
  const { refillsQuery, rows, realtime } = useFinanceApprovalQueue();

  return (
    <Screen scroll={false}>
      <View style={styles.page}>
        <View style={styles.header}>
          <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
          <View style={styles.hero}>
            <Text variant="h2" color={semantic.textInverse}>Approval Refill</Text>
            <Text variant="caption" color={semantic.textInverse}>
              Permintaan menunggu keputusan Anda
            </Text>
          </View>
          <ConnectionBanner state={realtime.state} />
        </View>

        {refillsQuery.isLoading ? (
          <View style={styles.listPad}>
            <SkeletonList count={3} lines={3} />
          </View>
        ) : refillsQuery.isError ? (
          <View style={styles.center}>
            <EmptyState
              icon="wifi-off"
              title="Gagal memuat permintaan"
              subtitle="Periksa koneksi internet Anda."
              tone="danger"
            >
              <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void refillsQuery.refetch()} />
            </EmptyState>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={rows}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.listContent}
            refreshing={refillsQuery.isRefetching}
            onRefresh={() => void refillsQuery.refetch()}
            renderItem={({ item, index }) => (
              <ApprovalCard refill={item} index={index} onConflict={() => void refillsQuery.refetch()} />
            )}
            ListEmptyComponent={
              <EmptyState
                icon="clipboard-check-outline"
                title="Tidak ada permintaan menunggu"
                subtitle="Semua permintaan refill sudah diproses."
              />
            }
          />
        )}
      </View>
    </Screen>
  );
}

function ApprovalCard({
  refill,
  index,
  onConflict,
}: {
  refill: RefillRequest;
  index: number;
  onConflict: () => void;
}) {
  const {
    approve, reject, qtyApproved, setQtyApproved, partialReason, setPartialReason,
    rejectReason, setRejectReason, showRejectInput, setShowRejectInput, error, setError,
    isPending, hasRetiredLines, anyReduced, hasCost, grandTotal, onApprove, onReject,
  } = useFinanceApprovalCard(refill, onConflict);

  return (
    <Card style={styles.card}>
      <RefillCard refill={refill} showCost index={index} />

      <View style={styles.lines}>
        {refill.lines.filter((line) => line.is_operational !== false).map((line) => {
          const qty = qtyApproved[line.id] ?? line.qty_requested;
          return (
            <View key={line.id} style={styles.lineRow}>
              <ProductThumbnail product={line} />
              <View style={styles.lineInfo}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {line.product_name}
                </Text>
                <Text variant="caption" color={semantic.textMuted}>
                  Diminta: {line.qty_requested} {line.unit}
                </Text>
                {typeof line.unit_cost === 'number' ? (
                  <Text variant="caption" color={semantic.textMuted}>
                    {formatRupiah(qty * line.unit_cost)}
                  </Text>
                ) : null}
              </View>
              <QtyStepper
                value={qty}
                onChange={(next) => setQtyApproved((prev) => ({ ...prev, [line.id]: next }))}
                max={line.qty_requested}
                capHint={`maks. ${line.qty_requested} (diminta)`}
                disabled={isPending}
              />
            </View>
          );
        })}
      </View>

      {hasRetiredLines ? <Banner tone="warning" message="Request lama ini punya produk yang sudah tidak dipakai. Tolak request ini dan minta Rider kirim ulang ya." /> : null}

      {hasCost ? <MetaRow label="Total Disetujui" value={formatRupiah(grandTotal)} emphasis /> : null}

      {anyReduced ? (
        <Input
          label="Alasan Pengurangan"
          placeholder="Jelaskan alasan pengurangan jumlah (min. 10 karakter)"
          value={partialReason}
          onChangeText={setPartialReason}
          multiline
          editable={!isPending}
        />
      ) : null}

      {showRejectInput ? (
        <Input
          label="Alasan Penolakan"
          placeholder="Jelaskan alasan penolakan (min. 10 karakter)"
          value={rejectReason}
          onChangeText={setRejectReason}
          multiline
          editable={!isPending}
        />
      ) : null}

      {error ? <Banner message={error} tone="danger" /> : null}

      <View style={styles.actions}>
        {showRejectInput ? (
          <>
            <Button
              label="Batal"
              variant="ghost"
              fullWidth={false}
              style={styles.actionBtn}
              onPress={() => {
                setShowRejectInput(false);
                setError(null);
              }}
              disabled={isPending}
            />
            <Button
              label="Konfirmasi Tolak"
              variant="danger"
              fullWidth={false}
              style={styles.actionBtn}
              onPress={() => void onReject()}
              loading={reject.isPending}
              disabled={isPending}
            />
          </>
        ) : (
          <>
            <Button
              label="Tolak"
              icon="close"
              variant="secondary"
              fullWidth={false}
              style={styles.actionBtn}
              onPress={() => setShowRejectInput(true)}
              disabled={isPending}
            />
            <Button
              label="Setujui"
              icon="check"
              variant="primary"
              fullWidth={false}
              style={styles.actionBtn}
              onPress={() => void onApprove()}
              loading={approve.isPending}
              disabled={isPending || hasRetiredLines}
            />
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { padding: space.lg, gap: space.sm },
  hero: {
    backgroundColor: semantic.primaryPressed,
    borderRadius: radius.card,
    padding: space.xl,
    gap: space.xs,
  },
  listPad: { paddingHorizontal: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  list: { flex: 1 },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space['2xl'], gap: space.lg },

  card: { gap: space.md, padding: space.md },
  lines: { gap: space.sm },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    backgroundColor: neutral[50],
    borderRadius: radius.md,
    padding: space.md,
  },
  lineInfo: { flex: 1, gap: space.xxs },

  actions: { flexDirection: 'row', gap: space.sm, paddingBottom: space.xs },
  actionBtn: { flex: 1 },
});

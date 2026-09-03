import { useMemo, useState } from 'react';
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
import { MetaRow } from '@/components/ui/Section';
import { RefillCard, formatRupiah } from '@/components/refill/RefillCard';
import { useApproveRefill, useRefills, useRejectRefill } from '@/features/refill/queries';
import { useRealtime } from '@/features/realtime/useRealtime';
import { ApiError } from '@/lib/api';
import { semantic, space } from '@/theme';
import type { RefillRequest } from '@/domain/types';

const MIN_REASON_LENGTH = 10;

/**
 * requirement 4 — the approval gate the whole state machine hinges on (R1).
 *
 * This is the single most time-sensitive screen in the app: nothing downstream (barista prep,
 * rider pickup, delivery) can move until a SUBMITTED request is decided here. It must not rely
 * on the operator remembering to pull-to-refresh — see `useRealtime()`'s docblock for what
 * "connected" actually means and what the polling fallback covers when it isn't.
 */
export default function FinanceApprovalsScreen() {
  const router = useRouter();
  const refillsQuery = useRefills('SUBMITTED');
  const rows = refillsQuery.data ?? [];
  const realtime = useRealtime();

  return (
    <Screen scroll={false}>
      <View style={styles.page}>
        <View style={styles.header}>
          <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
          <Text variant="h2">Approval Refill</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Permintaan menunggu keputusan Anda
          </Text>
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
  const approve = useApproveRefill();
  const reject = useRejectRefill();

  const [qtyApproved, setQtyApproved] = useState<Record<number, number>>(() =>
    Object.fromEntries(refill.lines.map((line) => [line.id, line.qty_requested])),
  );
  const [partialReason, setPartialReason] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPending = approve.isPending || reject.isPending;

  const anyReduced = refill.lines.some(
    (line) => (qtyApproved[line.id] ?? line.qty_requested) < line.qty_requested,
  );

  const hasCost = refill.lines.some((line) => typeof line.unit_cost === 'number');
  const grandTotal = useMemo(
    () =>
      refill.lines.reduce((sum, line) => {
        const qty = qtyApproved[line.id] ?? line.qty_requested;
        return sum + qty * (line.unit_cost ?? 0);
      }, 0),
    [refill.lines, qtyApproved],
  );

  const handleConflict = (e: unknown) => {
    if (e instanceof ApiError && e.isConflict) {
      setError('Status permintaan sudah berubah. Muat ulang halaman.');
      onConflict();
      return true;
    }
    return false;
  };

  const onApprove = async () => {
    setError(null);

    if (anyReduced && partialReason.trim().length < MIN_REASON_LENGTH) {
      setError('Alasan pengurangan wajib diisi (min. 10 karakter)');
      return;
    }

    try {
      await approve.mutateAsync({
        id: refill.id,
        lines: refill.lines.map((line) => ({
          line_id: line.id,
          qty_approved: qtyApproved[line.id] ?? line.qty_requested,
        })),
        partialReason: anyReduced ? partialReason.trim() : undefined,
      });
    } catch (e) {
      if (!handleConflict(e)) {
        setError(e instanceof ApiError ? e.message : 'Gagal menyetujui permintaan. Coba lagi.');
      }
    }
  };

  const onReject = async () => {
    setError(null);

    if (rejectReason.trim().length < MIN_REASON_LENGTH) {
      setError('Alasan penolakan wajib diisi (min. 10 karakter)');
      return;
    }

    try {
      await reject.mutateAsync({ id: refill.id, reason: rejectReason.trim() });
    } catch (e) {
      if (!handleConflict(e)) {
        setError(e instanceof ApiError ? e.message : 'Gagal menolak permintaan. Coba lagi.');
      }
    }
  };

  return (
    <Card style={styles.card}>
      <RefillCard refill={refill} showCost index={index} />

      <View style={styles.lines}>
        {refill.lines.map((line) => {
          const qty = qtyApproved[line.id] ?? line.qty_requested;
          return (
            <View key={line.id} style={styles.lineRow}>
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
              disabled={isPending}
            />
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { padding: space.lg, gap: space.xxs },
  listPad: { paddingHorizontal: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  list: { flex: 1 },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },

  card: { gap: space.md },
  lines: { gap: space.md },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  lineInfo: { flex: 1, gap: space.xxs },

  actions: { flexDirection: 'row', gap: space.sm },
  actionBtn: { flex: 1 },
});

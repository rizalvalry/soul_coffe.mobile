import { useCallback, useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Banner } from '@/components/ui/Banner';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { MetaRow } from '@/components/ui/Section';
import { enter } from '@/components/ui/Motion';
import { RefillTimeline } from '@/components/refill/RefillTimeline';
import { formatRupiah } from '@/components/refill/RefillCard';
import { useCancelRefill, useRefill } from '@/features/refill/queries';
import { useAttendanceStatus } from '@/features/showcase/queries';
import { DAY_NOT_OPEN_MESSAGE, isDayNotOpen, riderDayGate, riderGateMessage } from '@/features/showcase/riderDayGate';
import { ApiError } from '@/lib/api';
import { brand, feedback, neutral, radius, semantic, space } from '@/theme';
import type { RefillRequest } from '@/domain/types';

export default function StaffRequestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const refillId = Number(id);

  const refillQuery = useRefill(refillId);
  const attendance = useAttendanceStatus();
  const cancelRefill = useCancelRefill();
  const [actionError, setActionError] = useState<string | null>(null);
  const dayGate = riderDayGate(attendance.data);
  const gateMessage = riderGateMessage(dayGate);

  const doCancel = useCallback(async () => {
    setActionError(null);
    if (gateMessage) {
      setActionError(gateMessage);
      return;
    }
    try {
      await cancelRefill.mutateAsync({ id: refillId });
    } catch (e) {
      setActionError(isDayNotOpen(e) ? DAY_NOT_OPEN_MESSAGE : e instanceof ApiError ? e.message : 'Gagal membatalkan permintaan. Coba lagi.');
      if (isDayNotOpen(e)) void attendance.refetch();
    }
  }, [cancelRefill, refillId, gateMessage, attendance]);

  const onCancelPress = useCallback(() => {
    Alert.alert('Batalkan permintaan?', 'Permintaan yang dibatalkan tidak dapat diproses kembali.', [
      { text: 'Tidak', style: 'cancel' },
      { text: 'Batalkan', style: 'destructive', onPress: () => void doCancel() },
    ]);
  }, [doCancel]);

  return (
    <Screen refreshing={refillQuery.isRefetching} onRefresh={() => void refillQuery.refetch()}>
      <View style={styles.top}>
        <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
      </View>

      {gateMessage ? <Banner tone="warning" message={gateMessage} /> : null}
      {dayGate === 'attendance' ? <Button label="Buka Absen" icon="fingerprint" onPress={() => router.push('/absen')} /> : null}

      {!Number.isFinite(refillId) || refillId <= 0 ? (
        <Card>
          <EmptyState icon="alert-circle-outline" title="Permintaan tidak ditemukan" tone="danger" />
        </Card>
      ) : refillQuery.isLoading ? (
        <>
          <SkeletonCard lines={1} />
          <SkeletonCard lines={3} />
        </>
      ) : refillQuery.isError || !refillQuery.data ? (
        <Card style={styles.stateCard}>
          <EmptyState icon="wifi-off" title="Gagal memuat permintaan" subtitle="Periksa koneksi internet Anda." tone="danger" />
          <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void refillQuery.refetch()} />
        </Card>
      ) : (
        <RequestDetail
          refill={refillQuery.data}
          onCancel={onCancelPress}
          cancelPending={cancelRefill.isPending}
          actionError={actionError}
          gateMessage={gateMessage}
        />
      )}
    </Screen>
  );
}

function RequestDetail({
  refill,
  onCancel,
  cancelPending,
  actionError,
  gateMessage,
}: {
  refill: RefillRequest;
  onCancel: () => void;
  cancelPending: boolean;
  actionError: string | null;
  gateMessage: string | null;
}) {
  return (
    <>
      <Animated.View entering={enter('below', 0)}>
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text variant="h2">{refill.code}</Text>
              <Text variant="caption" color={semantic.textMuted}>
                Gerobak {refill.cart_code} · {refill.staff_name}
              </Text>
            </View>
            <StatusBadge status={refill.status} />
          </View>

          {typeof refill.total_cost === 'number' ? (
            <MetaRow label="Nilai Permintaan" value={formatRupiah(refill.total_cost)} emphasis />
          ) : null}
        </Card>
      </Animated.View>

      {refill.status === 'EXPIRED' ? (
        <Animated.View entering={enter('below', 1)}>
          <Card style={styles.expiredCard}>
            <Text variant="bodyStrong" color={feedback.warningFg}>Request Kedaluwarsa</Text>
            <Text variant="body">
              {refill.status_message ?? 'Request ini tidak selesai pada tanggal operasionalnya. Anda dapat mengajukan request baru; Finance menangani barang fisik secara terpisah.'}
            </Text>
          </Card>
        </Animated.View>
      ) : null}

      {refill.status === 'REJECTED' && refill.decision_reason ? (
        <Animated.View entering={enter('below', 1)}>
          <Card style={styles.reasonCard}>
            <View style={styles.reasonHeader}>
              <MaterialCommunityIcons name="close-circle" size={18} color={feedback.dangerFg} />
              <Text variant="bodyStrong" color={feedback.dangerFg}>
                Alasan Penolakan
              </Text>
            </View>
            <Text variant="body">{refill.decision_reason}</Text>
          </Card>
        </Animated.View>
      ) : null}

      <Animated.View entering={enter('below', 2)}>
        <Card style={styles.evidenceCard}>
          <Text variant="bodyStrong">Foto Bukti</Text>
          {refill.evidence_photo_url ? (
            <Image source={{ uri: refill.evidence_photo_url }} style={styles.photo} />
          ) : (
            <EmptyState icon="image-off-outline" title="Foto tidak tersedia" tone="neutral" />
          )}
        </Card>
      </Animated.View>

      <Animated.View entering={enter('below', 3)}>
        <Card style={styles.linesCard}>
          <Text variant="bodyStrong">Rincian Produk</Text>
          <View style={styles.tableHead}>
            <Text variant="micro" color={semantic.textSubtle} style={styles.colProduct}>
              PRODUK
            </Text>
            <Text variant="micro" color={semantic.textSubtle} style={styles.colQty}>
              DIMINTA
            </Text>
            <Text variant="micro" color={semantic.textSubtle} style={styles.colQty}>
              APPROVE
            </Text>
            <Text variant="micro" color={semantic.textSubtle} style={styles.colQty}>
              SIAP
            </Text>
            <Text variant="micro" color={semantic.textSubtle} style={styles.colQty}>
              TERIMA
            </Text>
          </View>

          {refill.lines.map((line) => (
            <View key={line.id} style={styles.tableRow}>
              <Text variant="caption" style={styles.colProduct} numberOfLines={2}>
                {line.product_name}
              </Text>
              <Text variant="caption" style={styles.colQty}>
                {line.qty_requested}
              </Text>
              <Text variant="caption" style={styles.colQty}>
                {line.qty_approved ?? '-'}
              </Text>
              <Text variant="caption" style={styles.colQty}>
                {line.qty_prepared ?? '-'}
              </Text>
              <Text variant="caption" style={styles.colQty}>
                {line.qty_received ?? '-'}
              </Text>
            </View>
          ))}

          <View style={styles.tableFooter}>
            <Text variant="bodyStrong" style={styles.colProduct}>
              Total
            </Text>
            <Text variant="bodyStrong" style={styles.colQty}>
              {refill.total_requested}
            </Text>
            <View style={styles.colQty} />
            <View style={styles.colQty} />
            <View style={styles.colQty} />
          </View>
        </Card>
      </Animated.View>

      <Animated.View entering={enter('below', 4)}>
        <Card>
          <Text variant="bodyStrong" style={styles.timelineTitle}>
            Riwayat Status
          </Text>
          <RefillTimeline refill={refill} />
        </Card>
      </Animated.View>

      {actionError ? <Banner message={actionError} tone="danger" /> : null}

      {refill.can.cancel ? (
        <Animated.View entering={enter('below', 5)}>
          <Button
            label="Batalkan Permintaan"
            icon="close-circle-outline"
            variant="danger"
            onPress={onCancel}
            loading={cancelPending}
            disabled={cancelPending || !!gateMessage}
          />
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  stateCard: { gap: space.md },

  headerCard: { gap: space.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  headerText: { flex: 1, gap: space.xxs },

  reasonCard: { gap: space.sm, borderColor: feedback.dangerBorder, backgroundColor: feedback.dangerBg },
  expiredCard: { gap: space.sm, borderColor: feedback.warningBorder, backgroundColor: feedback.warningBg },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  evidenceCard: { gap: space.md },
  photo: { width: '100%', height: 200, borderRadius: radius.md, backgroundColor: neutral[100] },

  linesCard: { gap: space.sm },
  tableHead: { flexDirection: 'row', gap: space.xs, paddingHorizontal: space.sm },
  // Boxed rows, not hairline dividers — a soft tinted background per row is what makes a data
  // grid read as a mobile app's list rather than a spreadsheet printed onto a phone screen.
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: semantic.surfaceSunken,
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
  },
  tableFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: brand[50],
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    marginTop: space.xxs,
  },
  colProduct: { flex: 2 },
  colQty: { flex: 1, textAlign: 'center' },

  timelineTitle: { marginBottom: space.md },
});

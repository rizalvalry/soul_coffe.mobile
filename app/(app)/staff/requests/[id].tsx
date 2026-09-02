import { useCallback, useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { RefillTimeline } from '@/components/refill/RefillTimeline';
import { formatRupiah } from '@/components/refill/RefillCard';
import { useCancelRefill, useRefill } from '@/features/refill/queries';
import { ApiError } from '@/lib/api';
import { feedback, neutral, radius, semantic, space } from '@/theme';
import type { RefillRequest } from '@/domain/types';

export default function StaffRequestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const refillId = Number(id);

  const refillQuery = useRefill(refillId);
  const cancelRefill = useCancelRefill();
  const [actionError, setActionError] = useState<string | null>(null);

  const doCancel = useCallback(async () => {
    setActionError(null);
    try {
      await cancelRefill.mutateAsync({ id: refillId });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Gagal membatalkan permintaan. Coba lagi.');
    }
  }, [cancelRefill, refillId]);

  const onCancelPress = useCallback(() => {
    Alert.alert(
      'Batalkan permintaan?',
      'Permintaan yang dibatalkan tidak dapat diproses kembali.',
      [
        { text: 'Tidak', style: 'cancel' },
        { text: 'Batalkan', style: 'destructive', onPress: () => void doCancel() },
      ],
    );
  }, [doCancel]);

  return (
    <Screen refreshing={refillQuery.isRefetching} onRefresh={() => void refillQuery.refetch()}>
      <View style={styles.top}>
        <Button
          label="Kembali"
          icon="chevron-left"
          variant="ghost"
          fullWidth={false}
          onPress={() => router.back()}
        />
      </View>

      {!Number.isFinite(refillId) || refillId <= 0 ? (
        <Card>
          <EmptyState icon="alert-circle-outline" title="Permintaan tidak ditemukan" />
        </Card>
      ) : refillQuery.isLoading ? (
        <Card>
          <Text color={semantic.textMuted} center>
            Memuat detail permintaan...
          </Text>
        </Card>
      ) : refillQuery.isError || !refillQuery.data ? (
        <Card style={styles.stateCard}>
          <EmptyState
            icon="alert-circle-outline"
            title="Gagal memuat permintaan"
            subtitle="Periksa koneksi internet Anda."
          />
          <Button label="Coba Lagi" variant="secondary" onPress={() => void refillQuery.refetch()} />
        </Card>
      ) : (
        <RequestDetail
          refill={refillQuery.data}
          onCancel={onCancelPress}
          cancelPending={cancelRefill.isPending}
          actionError={actionError}
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
}: {
  refill: RefillRequest;
  onCancel: () => void;
  cancelPending: boolean;
  actionError: string | null;
}) {
  return (
    <>
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
          <View style={styles.costRow}>
            <Text variant="caption" color={semantic.textMuted}>
              Nilai Permintaan
            </Text>
            <Text variant="bodyStrong">{formatRupiah(refill.total_cost)}</Text>
          </View>
        ) : null}
      </Card>

      {refill.status === 'REJECTED' && refill.decision_reason ? (
        <Card style={styles.reasonCard}>
          <View style={styles.reasonHeader}>
            <MaterialCommunityIcons name="close-circle-outline" size={18} color={feedback.dangerFg} />
            <Text variant="bodyStrong" color={feedback.dangerFg}>
              Alasan Penolakan
            </Text>
          </View>
          <Text variant="body">{refill.decision_reason}</Text>
        </Card>
      ) : null}

      <Card style={styles.evidenceCard}>
        <Text variant="bodyStrong">Foto Bukti</Text>
        {refill.evidence_photo_url ? (
          <Image source={{ uri: refill.evidence_photo_url }} style={styles.photo} />
        ) : (
          <EmptyState icon="image-off-outline" title="Foto tidak tersedia" />
        )}
      </Card>

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

      <Card>
        <Text variant="bodyStrong" style={styles.timelineTitle}>
          Riwayat Status
        </Text>
        <RefillTimeline refill={refill} />
      </Card>

      {actionError ? (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={feedback.dangerFg} />
          <Text variant="caption" color={feedback.dangerFg} style={styles.errorText}>
            {actionError}
          </Text>
        </View>
      ) : null}

      {refill.can.cancel ? (
        <Button
          label="Batalkan Permintaan"
          icon="close-circle-outline"
          variant="danger"
          onPress={onCancel}
          loading={cancelPending}
          disabled={cancelPending}
        />
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
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    paddingTop: space.sm,
  },

  reasonCard: { gap: space.sm, borderColor: feedback.dangerBorder, backgroundColor: feedback.dangerBg },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  evidenceCard: { gap: space.md },
  photo: { width: '100%', height: 200, borderRadius: radius.md, backgroundColor: neutral[100] },

  linesCard: { gap: space.sm },
  tableHead: { flexDirection: 'row', gap: space.xs },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    paddingTop: space.sm,
  },
  tableFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderTopWidth: 1,
    borderTopColor: semantic.borderStrong,
    paddingTop: space.sm,
    marginTop: space.xxs,
  },
  colProduct: { flex: 2 },
  colQty: { flex: 1, textAlign: 'center' },

  timelineTitle: { marginBottom: space.md },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: feedback.dangerBg,
    borderColor: feedback.dangerBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  errorText: { flex: 1 },
});

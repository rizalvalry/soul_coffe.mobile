import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { enter } from '@/components/ui/Motion';
import { useMyAllocation } from '@/features/refill/queries';
import { brand, radius, semantic, space } from '@/theme';
import type { Allocation } from '@/domain/types';

function formatOperatingDate(isoDate: string): string {
  // operating_date is YYYY-MM-DD (docs/04 Conventions) — parsed as UTC midnight so it never
  // shifts a day backward in a negative-offset timezone.
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

/** The digital *Surat Pengambilan Barang* — the paper form in §4, reproduced field for field. */
export default function StaffAllocationScreen() {
  const router = useRouter();
  const allocationQuery = useMyAllocation();

  return (
    <Screen refreshing={allocationQuery.isRefetching} onRefresh={() => void allocationQuery.refetch()}>
      <View style={styles.top}>
        <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
      </View>

      <View>
        <Text variant="h2">Alokasi Hari Ini</Text>
        <Text variant="caption" color={semantic.textMuted}>
          Surat Pengambilan Barang
        </Text>
      </View>

      {allocationQuery.isLoading ? (
        <SkeletonCard lines={4} />
      ) : allocationQuery.isError ? (
        <Card style={styles.stateCard}>
          <EmptyState icon="wifi-off" title="Gagal memuat alokasi" subtitle="Periksa koneksi internet Anda." tone="danger" />
          <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void allocationQuery.refetch()} />
        </Card>
      ) : !allocationQuery.data ? (
        <Card>
          <EmptyState icon="clipboard-text-off-outline" title="Belum ada alokasi hari ini" subtitle="Hubungi Barista untuk alokasi harian gerobak Anda." />
        </Card>
      ) : (
        <AllocationSlip allocation={allocationQuery.data} />
      )}
    </Screen>
  );
}

function AllocationSlip({ allocation }: { allocation: Allocation }) {
  return (
    <Animated.View entering={enter('below')}>
      <Card style={styles.slip}>
        <View style={styles.slipHead}>
          <View style={styles.slipIcon}>
            <Text variant="h3">📋</Text>
          </View>
          <Text variant="h3" center>
            Surat Pengambilan Barang
          </Text>

          {allocation.status === 'PENDING_FINANCE' || allocation.is_correction ? (
            <View style={styles.tagRow}>
              {allocation.status === 'PENDING_FINANCE' ? <Chip tone="amber" label="MENUNGGU APPROVAL FINANCE" /> : null}
              {allocation.is_correction ? <Chip tone="brand" label="KOREKSI ALOKASI" /> : null}
            </View>
          ) : null}
        </View>

        <View style={styles.metaGrid}>
          <MetaRow label="Tanggal Pengambilan" value={formatOperatingDate(allocation.operating_date)} />
          <MetaRow label="Kode Sepeda" value={allocation.cart_code} />
          <MetaRow label="Nama Karyawan" value={allocation.staff_name} />
          {allocation.location_name ? <MetaRow label="Lokasi" value={allocation.location_name} /> : null}
          <MetaRow label="Disiapkan Oleh" value={allocation.barista_name ?? 'Tidak diketahui'} />
        </View>

        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text variant="micro" color={semantic.textSubtle} style={styles.colName}>
              NAMA PRODUK
            </Text>
            <Text variant="micro" color={semantic.textSubtle} style={styles.colQty}>
              JUMLAH
            </Text>
          </View>

          {allocation.lines.map((line, index) => (
            <Animated.View key={line.product_id} entering={enter('below', index, 6)} style={styles.tableRow}>
              <Text variant="body" style={styles.colName} numberOfLines={1}>
                {line.product_name}
              </Text>
              <Text variant="bodyStrong" style={styles.colQty}>
                {line.qty_issued}
              </Text>
            </Animated.View>
          ))}

          <View style={styles.tableFooter}>
            <Text variant="bodyStrong" style={styles.colName}>
              Jumlah
            </Text>
            <View style={styles.colQtyValue}>
              <AnimatedNumber value={allocation.total_qty} variant="h3" color={brand[700]} />
            </View>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text variant="caption" color={semantic.textMuted} style={styles.metaLabel}>
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  stateCard: { gap: space.md },

  slip: { gap: space.lg },
  slipHead: { alignItems: 'center', gap: space.sm },
  slipIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, justifyContent: 'center' },

  metaGrid: { gap: space.sm },
  metaRow: { gap: space.xxs },
  metaLabel: { textTransform: 'uppercase' },

  table: { gap: space.sm },
  tableHead: { flexDirection: 'row', gap: space.sm, borderBottomWidth: 1, borderBottomColor: semantic.border, paddingBottom: space.xs },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    paddingTop: space.sm,
  },
  tableFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: semantic.borderStrong,
    paddingTop: space.sm,
    marginTop: space.xxs,
  },
  colName: { flex: 2 },
  colQty: { flex: 1, textAlign: 'right' },
  colQtyValue: { flex: 1, alignItems: 'flex-end' },
});

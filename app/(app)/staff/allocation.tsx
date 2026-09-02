import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMyAllocation } from '@/features/refill/queries';
import { brand, feedback, radius, semantic, space } from '@/theme';
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
    <Screen>
      <View style={styles.top}>
        <Button
          label="Kembali"
          icon="chevron-left"
          variant="ghost"
          fullWidth={false}
          onPress={() => router.back()}
        />
      </View>

      <View>
        <Text variant="h2">Alokasi Hari Ini</Text>
        <Text variant="caption" color={semantic.textMuted}>
          Surat Pengambilan Barang
        </Text>
      </View>

      {allocationQuery.isLoading ? (
        <Card>
          <Text color={semantic.textMuted} center>
            Memuat alokasi...
          </Text>
        </Card>
      ) : allocationQuery.isError ? (
        <Card style={styles.stateCard}>
          <EmptyState
            icon="alert-circle-outline"
            title="Gagal memuat alokasi"
            subtitle="Periksa koneksi internet Anda."
          />
          <Button label="Coba Lagi" variant="secondary" onPress={() => void allocationQuery.refetch()} />
        </Card>
      ) : !allocationQuery.data ? (
        <Card>
          <EmptyState
            icon="clipboard-text-off-outline"
            title="Belum ada alokasi hari ini"
            subtitle="Hubungi Barista untuk alokasi harian gerobak Anda."
          />
        </Card>
      ) : (
        <AllocationSlip allocation={allocationQuery.data} />
      )}
    </Screen>
  );
}

function AllocationSlip({ allocation }: { allocation: Allocation }) {
  return (
    <Card style={styles.slip}>
      <Text variant="h3" center>
        SURAT PENGAMBILAN BARANG
      </Text>

      {allocation.status === 'PENDING_FINANCE' ? (
        <View style={styles.pendingNote}>
          <Text variant="micro" color={feedback.warningFg}>
            MENUNGGU APPROVAL FINANCE — ALOKASI MELEBIHI TARGET
          </Text>
        </View>
      ) : null}

      {allocation.is_correction ? (
        <View style={styles.correctionNote}>
          <Text variant="micro" color={feedback.infoFg}>
            KOREKSI ALOKASI
          </Text>
        </View>
      ) : null}

      <View style={styles.metaGrid}>
        <MetaRow label="Tanggal Pengambilan" value={formatOperatingDate(allocation.operating_date)} />
        <MetaRow label="Kode Sepeda" value={allocation.cart_code} />
        <MetaRow label="Nama Karyawan" value={allocation.staff_name} />
        {allocation.location_name ? <MetaRow label="Lokasi" value={allocation.location_name} /> : null}
        <MetaRow label="Disiapkan Oleh" value={allocation.barista_name} />
      </View>

      <View style={styles.table}>
        <View style={styles.tableHead}>
          <Text variant="micro" color={semantic.textSubtle} style={styles.colName}>
            NAMA PRODUCT
          </Text>
          <Text variant="micro" color={semantic.textSubtle} style={styles.colQty}>
            JUMLAH PENGAMBILAN
          </Text>
        </View>

        {allocation.lines.map((line) => (
          <View key={line.product_id} style={styles.tableRow}>
            <Text variant="body" style={styles.colName}>
              {line.product_name}
            </Text>
            <Text variant="bodyStrong" style={styles.colQty}>
              {line.qty_issued}
            </Text>
          </View>
        ))}

        <View style={styles.tableFooter}>
          <Text variant="bodyStrong" style={styles.colName}>
            Jumlah
          </Text>
          <Text variant="h3" color={brand[700]} style={styles.colQty}>
            {allocation.total_qty}
          </Text>
        </View>
      </View>
    </Card>
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
  pendingNote: {
    alignSelf: 'center',
    backgroundColor: feedback.warningBg,
    borderColor: feedback.warningBorder,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  correctionNote: {
    alignSelf: 'center',
    backgroundColor: feedback.infoBg,
    borderColor: feedback.infoBorder,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },

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
});

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { useStaffOnShift, useProducts, useCreateAllocation } from '@/features/refill/queries';
import { ApiError } from '@/lib/api';
import type { StaffOnShift } from '@/domain/types';
import { brand, feedback, radius, semantic, space } from '@/theme';

/** Local operating date — server time is authoritative for anything that matters (R16); this
 * is only the label the barista is composing an allocation for. */
function todayOperatingDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const OVER_TARGET_TOLERANCE_PCT = 20;

export default function BaristaAllocationScreen() {
  const staffQuery = useStaffOnShift();
  const productsQuery = useProducts();
  const createAllocation = useCreateAllocation();

  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [qtyByProduct, setQtyByProduct] = useState<Record<number, number>>({});
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  const staffList = staffQuery.data ?? [];
  const products = useMemo(
    () => [...(productsQuery.data ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [productsQuery.data],
  );

  const selectedStaff: StaffOnShift | undefined = staffList.find(
    (s) => s.staff_id === selectedStaffId,
  );

  // Pre-fill from the standardised target the moment a staff member is picked, or products load.
  useEffect(() => {
    if (!selectedStaff || products.length === 0) return;
    const map: Record<number, number> = {};
    for (const product of products) {
      const target = selectedStaff.targets.find((t) => t.product_id === product.id);
      map[product.id] = target?.target_qty ?? 0;
    }
    setQtyByProduct(map);
  }, [selectedStaff, products]);

  const totalQty = Object.values(qtyByProduct).reduce((sum, n) => sum + n, 0);
  const totalTarget = selectedStaff
    ? selectedStaff.targets.reduce((sum, t) => sum + t.target_qty, 0)
    : 0;
  const overPct =
    totalTarget > 0 ? Math.round(((totalQty - totalTarget) / totalTarget) * 100) : 0;
  const overTarget = totalTarget > 0 && overPct > OVER_TARGET_TOLERANCE_PCT;

  const selectStaff = (staffId: number) => {
    setSelectedStaffId(staffId);
    setBanner(null);
  };

  const buildLines = () => products.map((p) => ({ product_id: p.id, qty_issued: qtyByProduct[p.id] ?? 0 }));

  const submit = async (correction?: string) => {
    if (!selectedStaff) return;
    setBanner(null);
    try {
      await createAllocation.mutateAsync({
        operatingDate: todayOperatingDate(),
        cartId: selectedStaff.cart_id,
        staffId: selectedStaff.staff_id,
        locationId: selectedStaff.location_id,
        lines: buildLines(),
        ...(correction ? { correctionReason: correction } : {}),
      });
      setCorrectionOpen(false);
      setCorrectionReason('');
      Alert.alert('Berhasil', `Alokasi harian untuk ${selectedStaff.staff_name} terkirim.`);
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) {
        // E20 — a second allocation for the same cart/day is a correction, not a duplicate error.
        setCorrectionOpen(true);
      } else if (e instanceof ApiError) {
        setBanner(e.message);
      } else {
        setBanner('Terjadi kesalahan tidak terduga.');
      }
    }
  };

  if (staffQuery.isLoading || productsQuery.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={brand[700]} />
      </Screen>
    );
  }

  if (staffQuery.isError || productsQuery.isError) {
    return (
      <Screen>
        <Card style={styles.stateCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={28} color={feedback.dangerFg} />
          <Text variant="bodyStrong" center>Gagal memuat data</Text>
          <Text variant="caption" color={semantic.textMuted} center>
            {(staffQuery.error as Error | null)?.message ?? (productsQuery.error as Error | null)?.message ?? 'Periksa koneksi Anda.'}
          </Text>
          <Button
            label="Coba Lagi"
            onPress={() => {
              void staffQuery.refetch();
              void productsQuery.refetch();
            }}
          />
        </Card>
      </Screen>
    );
  }

  const refreshing = staffQuery.isRefetching || productsQuery.isRefetching;
  const refresh = () => {
    void staffQuery.refetch();
    void productsQuery.refetch();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Text variant="h2">Alokasi Harian</Text>
      <Text variant="caption" color={semantic.textMuted}>
        Pilih staff yang bertugas, sesuaikan jumlah dari target standar, lalu kirim.
      </Text>

      <Card style={styles.card}>
        <Text variant="bodyStrong">Staff Bertugas</Text>
        {staffList.length === 0 ? (
          <Text variant="caption" color={semantic.textMuted}>
            Tidak ada staff yang bertugas hari ini.
          </Text>
        ) : (
          <View style={styles.staffList}>
            {staffList.map((s) => {
              const active = s.staff_id === selectedStaffId;
              return (
                <Pressable
                  key={s.staff_id}
                  onPress={() => selectStaff(s.staff_id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Pilih ${s.staff_name}`}
                  style={({ pressed }) => [
                    styles.staffRow,
                    active && styles.staffRowActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.staffRowText}>
                    <Text variant="bodyStrong">{s.staff_name}</Text>
                    <Text variant="caption" color={semantic.textMuted}>
                      Gerobak {s.cart_code} · {s.location_name ?? 'Lokasi belum ditetapkan'}
                    </Text>
                  </View>
                  {s.has_allocation ? (
                    <View style={styles.doneTag}>
                      <MaterialCommunityIcons name="check-circle" size={13} color={feedback.infoFg} />
                      <Text variant="micro" color={feedback.infoFg}>SUDAH DIALOKASIKAN</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      {selectedStaff ? (
        <>
          <Card style={styles.card}>
            <View style={styles.locationRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={18} color={brand[700]} />
              <Text variant="bodyStrong">
                Lokasi: {selectedStaff.location_name ?? 'Belum ditetapkan'}
              </Text>
            </View>

            {selectedStaff.has_allocation ? (
              <View style={styles.noteRow}>
                <MaterialCommunityIcons name="information-outline" size={15} color={feedback.infoFg} />
                <Text variant="caption" color={feedback.infoFg} style={styles.noteText}>
                  Staff ini sudah memiliki alokasi hari ini. Mengirim lagi akan tercatat sebagai koreksi.
                </Text>
              </View>
            ) : null}

            <View style={styles.lines}>
              {products.map((p) => (
                <View key={p.id} style={styles.lineRow}>
                  <View style={styles.lineText}>
                    <Text variant="body">{p.name}</Text>
                    <Text variant="micro" color={semantic.textSubtle}>
                      Target: {selectedStaff.targets.find((t) => t.product_id === p.id)?.target_qty ?? 0} {p.unit}
                    </Text>
                  </View>
                  <QtyStepper
                    value={qtyByProduct[p.id] ?? 0}
                    onChange={(next) => setQtyByProduct((prev) => ({ ...prev, [p.id]: next }))}
                    max={9999}
                  />
                </View>
              ))}
            </View>

            <View style={styles.totalRow}>
              <Text variant="bodyStrong">Total</Text>
              <Text variant="h3" color={brand[700]}>{totalQty} cups</Text>
            </View>

            {overTarget ? (
              <View style={styles.warningBanner}>
                <MaterialCommunityIcons name="alert-outline" size={18} color={feedback.warningFg} />
                <Text variant="caption" color={feedback.warningFg} style={styles.noteText}>
                  Melebihi target +{overPct}% — perlu approval Finance
                </Text>
              </View>
            ) : null}

            {banner ? (
              <View style={styles.errorBanner}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={feedback.dangerFg} />
                <Text variant="caption" color={feedback.dangerFg} style={styles.noteText}>{banner}</Text>
              </View>
            ) : null}

            <Button
              label={selectedStaff.has_allocation ? 'Kirim Sebagai Koreksi' : 'Kirim Alokasi'}
              onPress={() => void submit()}
              loading={createAllocation.isPending}
            />
          </Card>
        </>
      ) : (
        <Card style={styles.card}>
          <Text variant="caption" color={semantic.textMuted} center>
            Pilih staff di atas untuk mulai mengisi alokasi.
          </Text>
        </Card>
      )}

      <Modal visible={correctionOpen} transparent animationType="fade" onRequestClose={() => setCorrectionOpen(false)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text variant="h3">Alasan Koreksi</Text>
            <Text variant="caption" color={semantic.textMuted}>
              Gerobak ini sudah memiliki alokasi hari ini (E20). Jelaskan alasan koreksinya sebelum mengirim ulang.
            </Text>
            <Input
              label="Alasan Koreksi"
              value={correctionReason}
              onChangeText={setCorrectionReason}
              multiline
              numberOfLines={3}
              placeholder="Contoh: salah input jumlah pagi ini"
            />
            <View style={styles.modalActions}>
              <Button
                label="Batal"
                variant="ghost"
                fullWidth={false}
                onPress={() => {
                  setCorrectionOpen(false);
                  setCorrectionReason('');
                }}
              />
              <Button
                label="Kirim Koreksi"
                fullWidth={false}
                loading={createAllocation.isPending}
                disabled={correctionReason.trim().length === 0}
                onPress={() => void submit(correctionReason.trim())}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stateCard: { gap: space.md, alignItems: 'center' },
  card: { gap: space.md },
  staffList: { gap: space.sm },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.md,
    padding: space.md,
  },
  staffRowActive: { borderColor: brand[700], borderWidth: 2, backgroundColor: brand[50] },
  pressed: { opacity: 0.75 },
  staffRowText: { flex: 1, gap: space.xxs },
  doneTag: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  noteRow: { flexDirection: 'row', gap: space.sm, backgroundColor: feedback.infoBg, borderColor: feedback.infoBorder, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  noteText: { flex: 1 },
  lines: { gap: space.md },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  lineText: { flex: 1, gap: space.xxs },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: semantic.border, paddingTop: space.md },
  warningBanner: { flexDirection: 'row', gap: space.sm, backgroundColor: feedback.warningBg, borderColor: feedback.warningBorder, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  errorBanner: { flexDirection: 'row', gap: space.sm, backgroundColor: feedback.dangerBg, borderColor: feedback.dangerBorder, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  modalOverlay: { flex: 1, backgroundColor: semantic.overlay, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  modalCard: { width: '100%', gap: space.md },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});

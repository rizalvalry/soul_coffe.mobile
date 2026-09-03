import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { Chip } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Touchable } from '@/components/ui/Touchable';
import { MetaRow, SectionTitle } from '@/components/ui/Section';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { enter } from '@/components/ui/Motion';
import { useStaffOnShift, useProducts, useCreateAllocation } from '@/features/refill/queries';
import { ApiError } from '@/lib/api';
import type { StaffOnShift } from '@/domain/types';
import { brand, pressScale, radius, semantic, space } from '@/theme';

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

  const selectedStaff: StaffOnShift | undefined = staffList.find((s) => s.staff_id === selectedStaffId);

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
  const totalTarget = selectedStaff ? selectedStaff.targets.reduce((sum, t) => sum + t.target_qty, 0) : 0;
  const overPct = totalTarget > 0 ? Math.round(((totalQty - totalTarget) / totalTarget) * 100) : 0;
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

  const isLoading = staffQuery.isLoading || productsQuery.isLoading;
  const isError = staffQuery.isError || productsQuery.isError;

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList count={3} lines={1} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <Card style={styles.stateCard}>
          <EmptyState
            icon="wifi-off"
            title="Gagal memuat data"
            subtitle={
              (staffQuery.error as Error | null)?.message ?? (productsQuery.error as Error | null)?.message ?? 'Periksa koneksi Anda.'
            }
            tone="danger"
          />
          <Button
            label="Coba Lagi"
            icon="refresh"
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

      <SectionTitle title="Staff bertugas" caption={`${staffList.length} orang hari ini`} />

      <Card style={styles.card}>
        {staffList.length === 0 ? (
          <EmptyState icon="account-off-outline" title="Tidak ada staff bertugas" subtitle="Belum ada penugasan staff untuk hari ini." tone="neutral" />
        ) : (
          <View style={styles.staffList}>
            {staffList.map((s, index) => {
              const active = s.staff_id === selectedStaffId;
              return (
                <Animated.View key={s.staff_id} entering={enter('below', index, 8)}>
                  <Touchable
                    onPress={() => selectStaff(s.staff_id)}
                    scaleTo={pressScale.surface}
                    accessibilityRole="button"
                    accessibilityLabel={`Pilih ${s.staff_name}`}
                    accessibilityState={{ selected: active }}
                    style={[styles.staffRow, active && styles.staffRowActive]}
                  >
                    <View style={styles.staffAvatar}>
                      <MaterialCommunityIcons name="account" size={20} color={active ? brand[700] : semantic.textMuted} />
                    </View>
                    <View style={styles.staffRowText}>
                      <Text variant="bodyStrong">{s.staff_name}</Text>
                      <Text variant="caption" color={semantic.textMuted}>
                        Gerobak {s.cart_code} · {s.location_name ?? 'Lokasi belum ditetapkan'}
                      </Text>
                    </View>
                    {s.has_allocation ? (
                      <Chip tone="brand" label="SUDAH" icon={<MaterialCommunityIcons name="check-circle" size={13} color={brand[700]} />} />
                    ) : null}
                    <MaterialCommunityIcons
                      name={active ? 'check-circle' : 'chevron-right'}
                      size={active ? 22 : 20}
                      color={active ? brand[700] : semantic.textSubtle}
                    />
                  </Touchable>
                </Animated.View>
              );
            })}
          </View>
        )}
      </Card>

      {selectedStaff ? (
        <Animated.View key={selectedStaff.staff_id} entering={enter('below')}>
          <SectionTitle title="Jumlah alokasi" caption={selectedStaff.location_name ?? 'Lokasi belum ditetapkan'} icon="map-marker-outline" />

          <Card style={styles.card}>
            {selectedStaff.has_allocation ? (
              <Banner tone="info" message="Staff ini sudah memiliki alokasi hari ini. Mengirim lagi akan tercatat sebagai koreksi." />
            ) : null}

            <View style={styles.lines}>
              {products.map((p) => (
                <View key={p.id} style={styles.lineRow}>
                  <View style={styles.lineText}>
                    <Text variant="body" numberOfLines={1}>
                      {p.name}
                    </Text>
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

            <MetaRow label="Total" value={<AnimatedNumber value={totalQty} suffix=" cups" variant="h3" color={brand[700]} />} emphasis />

            {overTarget ? <Banner tone="warning" message={`Melebihi target +${overPct}% — perlu approval Finance`} /> : null}

            {banner ? <Banner tone="danger" message={banner} /> : null}

            <Button
              label={selectedStaff.has_allocation ? 'Kirim Sebagai Koreksi' : 'Kirim Alokasi'}
              icon="send"
              onPress={() => void submit()}
              loading={createAllocation.isPending}
            />
          </Card>
        </Animated.View>
      ) : (
        <Card style={styles.card}>
          <EmptyState icon="hand-pointing-up" title="Belum ada staff dipilih" subtitle="Pilih staff di atas untuk mulai mengisi alokasi." tone="neutral" />
        </Card>
      )}

      <Modal visible={correctionOpen} transparent animationType="fade" onRequestClose={() => setCorrectionOpen(false)}>
        <Animated.View entering={FadeIn.duration(180)} style={styles.modalOverlay}>
          <Animated.View entering={enter('scale')} style={styles.modalWrap}>
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
          </Animated.View>
        </Animated.View>
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
    gap: space.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: space.md,
  },
  staffRowActive: { borderColor: brand[300], backgroundColor: brand[50] },
  staffAvatar: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: semantic.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  staffRowText: { flex: 1, gap: space.xxs },

  lines: { gap: space.md },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  lineText: { flex: 1, gap: space.xxs },

  modalOverlay: { flex: 1, backgroundColor: semantic.overlay, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  modalWrap: { width: '100%' },
  modalCard: { gap: space.md },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { Chip } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { SectionTitle } from '@/components/ui/Section';
import { Touchable } from '@/components/ui/Touchable';
import {
  useApproveSettlement,
  useRecordSettlement,
  useSettlementDraft,
  useSettlementQueue,
  type RecordSettlementInput,
} from '@/features/settlements/queries';
import { settlementExpectations } from '@/features/settlements/expectations';
import { settlementTarget } from '@/features/settlements/navigation';
import { clearSettlementAttempt, loadOrCreateSettlementAttempt, readSettlementAttempt } from '@/features/settlements/draftAttempt';
import { useAuth } from '@/features/auth/store';
import { ApiError } from '@/lib/api';
import type { SettlementQueueRow } from '@/domain/types';
import { brand, feedback, neutral, radius, semantic, space } from '@/theme';

/**
 * Setoran — the Finance desk, on a phone, with a queue of riders in front of it.
 *
 * WHAT THIS SCREEN ASKS FOR
 * -------------------------
 * Three numbers: cash, QRIS, transfer. That is the only thing the person receiving the money
 * knows that the system does not.
 *
 * Everything else is already on screen before anyone types: cups issued, cups sold, cups still on
 * the cart, and what the day's transactions came to. A reconciliation where both sides are
 * reciting numbers at each other is how a five-minute handover becomes an argument.
 *
 * TWO STEPS, BECAUSE THE QUEUE IS REAL
 * ------------------------------------
 * Taking the money is one submit, and it is fast. What happens to the leftover cups — back to the
 * showcase for tomorrow, or thrown away now — is the second, and it can happen while the next
 * person is already being served.
 */

function rupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function saleAttribution(row: SettlementQueueRow): string | null {
  const names = row.sale_staff_names ?? [];
  if (names.length === 0 || (names.length === 1 && names[0] === row.staff_name)) return null;
  return `Penjualan oleh ${names.join(', ')}`;
}

/** Digits only. A money field that accepts "50.000,00" is a money field that will be typed wrong. */
function toAmount(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/** The API caps each method at Rp 1 trillion; 13 digits also stay inside JS's safe integer range. */
function moneyDigits(text: string): string {
  return text.replace(/\D/g, '').slice(0, 13);
}

function DepositSheet({ row, date, onClose }: { row: SettlementQueueRow; date?: string; onClose: () => void }) {
  const ownerId = useAuth((s) => s.session?.user.id ?? null);
  const draftQuery = useSettlementDraft(row.cart_id, date);
  const record = useRecordSettlement();
  const approve = useApproveSettlement();

  const [cash, setCash] = useState('');
  const [qris, setQris] = useState('');
  const [transfer, setTransfer] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recordedVariance, setRecordedVariance] = useState<number | null>(null);
  const [draftLocked, setDraftLocked] = useState(false);
  const attempt = useRef<Promise<RecordSettlementInput> | null>(null);

  // Set once the money is in; the screen then switches to the cups.
  const [settlementId, setSettlementId] = useState<number | null>(row.settlement_id);
  const [reRecord, setReRecord] = useState(false);
  const [staleCleared, setStaleCleared] = useState(false);
  const [returned, setReturned] = useState<Record<number, number>>({});
  const [rejected, setRejected] = useState<Record<number, number>>({});

  useEffect(() => {
    if (row.settlement_id !== null) {
      setSettlementId(row.settlement_id);
      if (ownerId) void clearSettlementAttempt(ownerId, row.cart_id, date).catch(() => {});
    }
  }, [row.settlement_id, row.cart_id, date, ownerId]);

  useEffect(() => {
    if (!ownerId || row.settlement_id !== null) return;
    let active = true;
    void readSettlementAttempt(ownerId, row.cart_id, date).then((stored) => {
      if (!active || !stored || attempt.current) return;
      attempt.current = Promise.resolve(stored);
      setCash(String(stored.cash));
      setQris(String(stored.qris));
      setTransfer(String(stored.transfer));
      setReason(stored.varianceReason ?? '');
      setDraftLocked(true);
      setError('Setoran tadi belum pasti masuk. Coba lagi pakai data yang sama ya.');
    }).catch(() => {
      if (active) {
        setDraftLocked(true);
        setError('Draft setoran belum bisa dibaca. Batalkan draft buat mulai lagi ya.');
      }
    });
    return () => { active = false; };
  }, [ownerId, row.cart_id, row.settlement_id, date]);

  const draft = draftQuery.data;
  const declared = toAmount(cash) + toAmount(qris) + toAmount(transfer);
  const expectations = settlementExpectations(draft, row);
  const expected = expectations.total;
  const variance = declared - expected;
  const flaggedVariance = recordedVariance ?? row.variance_minor ?? 0;

  const remainingLines = useMemo(
    () => (draft?.lines ?? []).filter((line) => line.qty_remaining > 0),
    [draft],
  );

  const submitMoney = useCallback(async () => {
    setError(null);

    try {
      if (!ownerId) throw new Error('Sesi Finance belum siap. Coba masuk lagi ya.');
      // Keep the key and exact body together: the server rejects a reused key with changed data.
      if (!attempt.current) {
        attempt.current = loadOrCreateSettlementAttempt(ownerId, {
          cartId: row.cart_id, date,
          cash: toAmount(cash), qris: toAmount(qris), transfer: toAmount(transfer),
          varianceReason: reason.trim() || undefined,
        });
      }
      let saved: RecordSettlementInput;
      try {
        saved = await attempt.current;
      } catch (e) {
        attempt.current = null;
        throw e;
      }
      setCash(String(saved.cash));
      setQris(String(saved.qris));
      setTransfer(String(saved.transfer));
      setReason(saved.varianceReason ?? '');
      setDraftLocked(true);
      const settlement = await record.mutateAsync(saved);

      await clearSettlementAttempt(ownerId, row.cart_id, date);
      attempt.current = null;
      setDraftLocked(false);
      setSettlementId(settlement.id);
      setReRecord(false);
      setStaleCleared(true);
      setRecordedVariance(settlement.variance);
      if (settlement.variance !== 0) {
        Alert.alert(
          'Setoran Tercatat',
          `Selisih ${rupiah(Math.abs(settlement.variance))} tercatat dan dilaporkan ke Administrator & Finance.`,
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Setoran belum bisa dikirim. Coba lagi ya.');
    }
  }, [ownerId, row.cart_id, date, cash, qris, transfer, reason, record]);

  const cancelDraft = useCallback(async () => {
    if (!ownerId) return;
    try {
      await clearSettlementAttempt(ownerId, row.cart_id, date);
      attempt.current = null;
      setDraftLocked(false);
      setError(null);
    } catch {
      setError('Draft belum bisa dibatalkan. Coba lagi ya.');
    }
  }, [ownerId, row.cart_id, date]);

  const reopenMoney = useCallback(async () => {
    setError(null);
    try {
      const fresh = await draftQuery.refetch();
      if (!fresh.isSuccess || !fresh.data) {
        setError('Angka Closing terbaru belum bisa dibuka. Coba lagi ya.');
        return;
      }
      setCash(String(row.cash_minor ?? toAmount(cash)));
      setQris(String(row.qris_minor ?? toAmount(qris)));
      setTransfer(String(row.transfer_minor ?? toAmount(transfer)));
      setReason('');
      setReRecord(true);
    } catch {
      setError('Angka Closing terbaru belum bisa dibuka. Coba lagi ya.');
    }
  }, [draftQuery, row.cash_minor, row.qris_minor, row.transfer_minor, cash, qris, transfer]);

  const submitCups = useCallback(async () => {
    setError(null);

    if (!settlementId) return;

    try {
      await approve.mutateAsync({
        settlementId,
        lines: (draft?.lines ?? []).map((line) => ({
          product_id: line.product_id,
          qty_returned: returned[line.product_id] ?? 0,
          qty_rejected: rejected[line.product_id] ?? 0,
        })),
      });

      Alert.alert('Setoran Selesai', `Gerobak ${row.cart_code ?? ''} sudah direkonsiliasi.`);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan tidak terduga.');
    }
  }, [settlementId, draft, returned, rejected, approve, onClose, row.cart_code]);

  return (
    <View style={styles.sheetRoot}>
      <View style={styles.sheetHeader}>
        <View>
          <Text variant="h3">{settlementId && !reRecord ? 'Cups Sisa' : 'Terima Setoran'}</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Gerobak {row.cart_code} · Penanggung jawab: {row.staff_name ?? '-'}
          </Text>
          {saleAttribution(row) ? <Text variant="caption" color={semantic.textMuted}>{saleAttribution(row)}</Text> : null}
        </View>
        <IconButton icon="close" label="Tutup" onPress={onClose} />
      </View>

      <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        {draftQuery.isLoading ? (
          <SkeletonList count={3} lines={1} />
        ) : (
          <>
            {/* What the system already knows. Shown first, so nobody has to ask for it. */}
            <Card style={styles.card}>
              <Text variant="bodyStrong">Hari ini menurut sistem</Text>
              <View style={styles.factRow}>
                <View style={styles.fact}>
                  <Text variant="caption" color={semantic.textMuted}>
                    Cups terjual
                  </Text>
                  <Text variant="h3">{row.cups_sold}</Text>
                </View>
                <View style={styles.factDivider} />
                <View style={styles.fact}>
                  <Text variant="caption" color={semantic.textMuted}>
                    Cups sisa
                  </Text>
                  <Text variant="h3">{row.cups_remaining}</Text>
                </View>
                <View style={styles.factDivider} />
                <View style={styles.fact}>
                  <Text variant="caption" color={semantic.textMuted}>
                    Seharusnya
                  </Text>
                  <Text variant="h3">{rupiah(expected)}</Text>
                </View>
              </View>
              {draft?.closing_id ? draft.lines.map((line) => (
                <Text key={line.product_id} variant="caption" color={semantic.textMuted}>
                  {line.product_name}: {line.qty_sold} terjual · {line.qty_wasted ?? 0} rusak · {line.qty_closing_remaining ?? 0} sisa
                </Text>
              )) : null}
              {expectations.cash !== null && expectations.qris !== null && expectations.transfer !== null ? (
                <View style={styles.expectedMethods}>
                  <View style={styles.totalRow}>
                    <Text variant="caption">Ekspektasi tunai</Text>
                    <Text variant="bodyStrong">{rupiah(expectations.cash)}</Text>
                  </View>
                  <View style={styles.methodRow}>
                    <Text variant="caption">Ekspektasi QRIS</Text>
                    <Text variant="bodyStrong">{rupiah(expectations.qris)}</Text>
                  </View>
                  <View style={styles.methodRow}>
                    <Text variant="caption">Ekspektasi transfer</Text>
                    <Text variant="bodyStrong">{rupiah(expectations.transfer)}</Text>
                  </View>
                </View>
              ) : (
                <Text variant="caption" color={semantic.textMuted}>
                  Rincian per metode belum tersedia. Total memakai data setoran yang ada.
                </Text>
              )}
            </Card>

            {!settlementId || reRecord ? (
              <>
                <Card style={styles.card}>
                  <Text variant="bodyStrong">Uang yang diterima</Text>
                  <Input
                    label="Tunai / Cash"
                    value={cash}
                    editable={!draftLocked}
                    onChangeText={(t) => setCash(moneyDigits(t))}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                  <Input
                    label="QRIS / Online"
                    value={qris}
                    editable={!draftLocked}
                    onChangeText={(t) => setQris(moneyDigits(t))}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                  <Input
                    label="Transfer"
                    value={transfer}
                    editable={!draftLocked}
                    onChangeText={(t) => setTransfer(moneyDigits(t))}
                    keyboardType="number-pad"
                    placeholder="0"
                  />

                  <View style={styles.totalRow}>
                    <Text variant="bodyStrong">Total diterima</Text>
                    <Text variant="h3">{rupiah(declared)}</Text>
                  </View>

                  {/* The gap is shown the moment it exists, not after a rejected submit. */}
                  {variance !== 0 ? (
                    <Banner
                      tone={variance < 0 ? 'danger' : 'warning'}
                      message={
                        variance < 0
                          ? `Kurang ${rupiah(Math.abs(variance))} dari transaksi tercatat. Selisih tetap dapat dicatat.`
                          : `Lebih ${rupiah(variance)} dari transaksi tercatat. Selisih tetap dapat dicatat.`
                      }
                    />
                  ) : null}

                  {variance !== 0 ? (
                    <Input
                      label="Alasan selisih (opsional)"
                      value={reason}
                      editable={!draftLocked}
                      onChangeText={setReason}
                      placeholder="Mis. uang kembalian kurang, rider ganti besok"
                      multiline
                      maxLength={500}
                    />
                  ) : null}
                </Card>

                {error ? <Banner tone="danger" message={error} /> : null}
                {error && draftLocked ? (
                  <Button label="Batalkan draft buat ubah angka" variant="secondary" onPress={() => void cancelDraft()} />
                ) : null}

                <Button
                  label={reRecord ? 'Catat ulang setoran' : 'Terima Setoran'}
                  icon="cash-check"
                  onPress={() => void submitMoney()}
                  loading={record.isPending}
                  disabled={record.isPending}
                />
              </>
            ) : (
              <>
                <Banner
                  tone="success"
                  message={flaggedVariance !== 0 || row.settlement_status === 'VARIANCE_FLAGGED'
                    ? 'Setoran dengan selisih tercatat dan dilaporkan ke Administrator & Finance. Sekarang pisahkan cups sisa.'
                    : 'Uang sudah tercatat. Sekarang pisahkan cups yang masih layak dari yang harus dibuang.'}
                />
                {row.expected_stale && !staleCleared ? (
                  <Banner
                    tone="warning"
                    message="Ekspektasi berubah setelah setoran dicatat. Periksa kembali nilainya sebelum menyelesaikan."
                  />
                ) : null}
                <Button label="Catat ulang setoran" variant="secondary" onPress={() => void reopenMoney()} />

                {remainingLines.length === 0 ? (
                  <Card style={styles.card}>
                    <EmptyState
                      icon="cup-off-outline"
                      title="Tidak ada cups sisa"
                      subtitle="Gerobak ini habis terjual, atau sudah ditutup Produksi. Tinggal selesaikan setorannya."
                      tone="neutral"
                    />
                  </Card>
                ) : (
                  remainingLines.map((line) => {
                    const good = returned[line.product_id] ?? 0;
                    const bad = rejected[line.product_id] ?? 0;
                    const left = line.qty_remaining - good - bad;

                    return (
                      <Card key={line.product_id} style={styles.card}>
                        <View style={styles.lineHead}>
                          <Text variant="bodyStrong" numberOfLines={1} style={styles.lineName}>
                            {line.product_name}
                          </Text>
                          <Chip
                            tone={left === 0 ? 'brand' : 'neutral'}
                            label={`sisa ${line.qty_remaining} ${line.unit}`}
                          />
                        </View>

                        <View style={styles.dispositionRow}>
                          <Text variant="caption" color={semantic.textMuted} style={styles.dispositionLabel}>
                            Masih layak, jual besok
                          </Text>
                          <QtyStepper
                            value={good}
                            max={line.qty_remaining - bad}
                            onChange={(next) => setReturned((prev) => ({ ...prev, [line.product_id]: next }))}
                          />
                        </View>

                        <View style={styles.dispositionRow}>
                          <Text variant="caption" color={feedback.dangerFg} style={styles.dispositionLabel}>
                            Reject, buang sekarang
                          </Text>
                          <QtyStepper
                            value={bad}
                            max={line.qty_remaining - good}
                            onChange={(next) => setRejected((prev) => ({ ...prev, [line.product_id]: next }))}
                          />
                        </View>

                        {left > 0 ? (
                          <Text variant="caption" color={semantic.textSubtle}>
                            {left} {line.unit} belum ditentukan — akan tetap tercatat di gerobak.
                          </Text>
                        ) : null}
                      </Card>
                    );
                  })
                )}

                {error ? <Banner tone="danger" message={error} /> : null}

                <Button
                  label="Selesaikan Setoran"
                  icon="check-circle-outline"
                  onPress={() => void submitCups()}
                  loading={approve.isPending}
                  disabled={approve.isPending}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

export default function FinanceSettlementsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; cart_id?: string }>();
  const { date, cartId } = settlementTarget(params);
  const queueQuery = useSettlementQueue(date);
  const [openCartId, setOpenCartId] = useState<number | null>(cartId);

  useEffect(() => setOpenCartId(cartId), [cartId, date]);

  const rows = queueQuery.data ?? [];
  const open = rows.find((row) => row.cart_id === openCartId && (row.closing_required === false || row.closing_id !== null)) ?? null;
  const waiting = rows.filter((row) => row.settlement_id === null).length;

  return (
    <Screen refreshing={queueQuery.isRefetching} onRefresh={() => void queueQuery.refetch()}>
      <View style={styles.top}>
        <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
      </View>

      <View style={styles.headerBlock}>
        <Text variant="h2">Setoran</Text>
        <Text variant="caption" color={semantic.textMuted}>
          {waiting > 0 ? `${waiting} gerobak belum menyetor` : 'Semua gerobak sudah menyetor'}
        </Text>
      </View>

      {rows.some((row) => row.closing_required !== false && row.closing_id === null) ? (
        <Banner tone="info" message="Gerobak yang belum Closing Rider masih menunggu. Form setoran baru bisa dibuka setelah Closing masuk." />
      ) : null}

      {queueQuery.isLoading ? (
        <SkeletonList count={4} lines={2} />
      ) : queueQuery.isError ? (
        <Card style={styles.card}>
          <EmptyState icon="wifi-off" title="Gagal memuat antrean" subtitle="Periksa koneksi Anda." tone="danger" />
          <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void queueQuery.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card style={styles.card}>
          <EmptyState
            icon="cash-remove"
            title={date ? `Belum ada gerobak bertugas pada ${date}` : 'Belum ada gerobak bertugas hari ini'}
            subtitle="Antrean setoran terisi setelah Produksi menyerahkan cups ke gerobak."
            tone="neutral"
          />
        </Card>
      ) : (
        <>
          <SectionTitle title={date ? `Antrean ${date}` : 'Antrean hari ini'} caption={`${rows.length} gerobak`} />

          {rows.map((row, index) => {
            const done = row.settlement_id !== null;
            const waitingClosing = row.closing_required !== false && row.closing_id === null;
            const arrivalDate = row.arrived_at ? new Date(row.arrived_at) : null;
            const arrivedTime = arrivalDate && !Number.isNaN(arrivalDate.getTime())
              ? arrivalDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              : null;

            return (
              <Touchable
                key={row.cart_id}
                onPress={() => { if (!waitingClosing) setOpenCartId(row.cart_id); }}
                accessibilityRole="button"
                accessibilityLabel={`Setoran gerobak ${row.cart_code}`}
                accessibilityState={{ disabled: waitingClosing }}
                style={[styles.queueRow, (done || waitingClosing) && styles.queueRowDone]}
              >
                <View style={styles.queueIcon}>
                  <MaterialCommunityIcons
                    name={done ? 'check-circle-outline' : 'cash-clock'}
                    size={22}
                    color={done ? brand[600] : semantic.textMuted}
                  />
                </View>

                <View style={styles.queueText}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {row.cart_code} · Penanggung jawab: {row.staff_name ?? '-'}
                  </Text>
                  {saleAttribution(row) ? (
                    <Text variant="caption" color={semantic.textMuted} numberOfLines={1}>
                      {saleAttribution(row)}
                    </Text>
                  ) : null}
                  <Text variant="caption" color={semantic.textMuted} numberOfLines={1}>
                    {row.cups_sold} cups terjual · sisa {row.cups_remaining} · {rupiah(row.expected_total_minor ?? row.expected_total ?? 0)}
                  </Text>
                  <Text variant="caption" color={semantic.textMuted}>
                    {row.closing_status ?? 'Menunggu closing Rider'}
                    {row.carry_warning ? ' · Sisa kemarin' : ''}
                    {(row.closeout_variance_count ?? 0) > 0 ? ' · Selisih Tutup Gerobak' : ''}
                  </Text>
                  <Text variant="caption" color={semantic.textMuted} numberOfLines={1}>
                    Urutan {index + 1} · {row.arrived_at === undefined
                      ? 'Status kedatangan belum tersedia'
                      : row.arrived_at === null
                        ? 'Belum tiba di dapur'
                        : arrivedTime ? `Tiba di dapur ${arrivedTime}` : 'Tiba di dapur'}
                  </Text>
                </View>

                <Chip
                  tone={done || row.arrived_at ? 'brand' : 'neutral'}
                  label={done ? (row.settlement_status === 'RECONCILED' ? 'Selesai' : 'Uang masuk')
                    : waitingClosing ? 'Menunggu closing Rider' : row.arrived_at ? 'Tiba' : 'Siap setor'}
                />
              </Touchable>
            );
          })}
        </>
      )}

      <Modal visible={open !== null} animationType="slide" onRequestClose={() => setOpenCartId(null)}>
        {open ? <DepositSheet key={`${date ?? 'today'}:${open.cart_id}`} row={open} date={date} onClose={() => setOpenCartId(null)} /> : null}
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  headerBlock: { gap: space.xxs },
  card: { gap: space.md },

  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: neutral[0],
    borderRadius: radius.lg,
    padding: space.md,
  },
  queueRowDone: { opacity: 0.75 },
  queueIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.surfaceSunken,
  },
  queueText: { flex: 1, gap: space.xxs },

  factRow: { flexDirection: 'row', alignItems: 'center' },
  fact: { flex: 1, alignItems: 'center', gap: space.xxs },
  factDivider: { width: 1, height: 32, backgroundColor: semantic.border },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    paddingTop: space.md,
  },
  expectedMethods: { gap: space.sm },
  methodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  lineName: { flex: 1 },
  dispositionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  dispositionLabel: { flex: 1 },

  sheetRoot: { flex: 1, backgroundColor: semantic.bg },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
    backgroundColor: '#FFFFFF',
  },
  sheetContent: { padding: space.lg, gap: space.md },
});

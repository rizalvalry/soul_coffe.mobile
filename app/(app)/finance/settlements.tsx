import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
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
} from '@/features/settlements/queries';
import { ApiError } from '@/lib/api';
import type { SettlementQueueRow } from '@/domain/types';
import { brand, feedback, neutral, radius, semantic, space } from '@/theme';

/**
 * Setoran — the Finance desk, on a phone, with a queue of staff in front of it.
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
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`;
}

/** Digits only. A money field that accepts "50.000,00" is a money field that will be typed wrong. */
function toAmount(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

function DepositSheet({ row, onClose }: { row: SettlementQueueRow; onClose: () => void }) {
  const draftQuery = useSettlementDraft(row.cart_id);
  const record = useRecordSettlement();
  const approve = useApproveSettlement();

  const [cash, setCash] = useState('');
  const [qris, setQris] = useState('');
  const [transfer, setTransfer] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Set once the money is in; the screen then switches to the cups.
  const [settlementId, setSettlementId] = useState<number | null>(row.settlement_id);
  const [returned, setReturned] = useState<Record<number, number>>({});
  const [rejected, setRejected] = useState<Record<number, number>>({});

  const draft = draftQuery.data;
  const declared = toAmount(cash) + toAmount(qris) + toAmount(transfer);
  const expected = draft?.expected_total ?? row.expected_total;
  const variance = declared - expected;

  const remainingLines = useMemo(
    () => (draft?.lines ?? []).filter((line) => line.qty_remaining > 0),
    [draft],
  );

  const submitMoney = useCallback(async () => {
    setError(null);

    try {
      const settlement = await record.mutateAsync({
        cartId: row.cart_id,
        cash: toAmount(cash),
        qris: toAmount(qris),
        transfer: toAmount(transfer),
        varianceReason: reason.trim() || undefined,
      });

      setSettlementId(settlement.id);
    } catch (e) {
      // The server's own sentence is more useful than anything invented here — it names the two
      // totals and asks for the reason.
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan tidak terduga.');
    }
  }, [row.cart_id, cash, qris, transfer, reason, record]);

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
          <Text variant="h3">{settlementId ? 'Cups Sisa' : 'Terima Setoran'}</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Gerobak {row.cart_code} · {row.staff_name ?? '-'}
          </Text>
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
            </Card>

            {!settlementId ? (
              <>
                <Card style={styles.card}>
                  <Text variant="bodyStrong">Uang yang diterima</Text>
                  <Input
                    label="Tunai / Cash"
                    value={cash}
                    onChangeText={(t) => setCash(String(toAmount(t) || ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                  <Input
                    label="QRIS / Online"
                    value={qris}
                    onChangeText={(t) => setQris(String(toAmount(t) || ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                  <Input
                    label="Transfer"
                    value={transfer}
                    onChangeText={(t) => setTransfer(String(toAmount(t) || ''))}
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
                          ? `Kurang ${rupiah(Math.abs(variance))} dari transaksi tercatat. Isi alasannya di bawah.`
                          : `Lebih ${rupiah(variance)} dari transaksi tercatat. Isi alasannya di bawah.`
                      }
                    />
                  ) : null}

                  {variance !== 0 ? (
                    <Input
                      label="Alasan selisih"
                      value={reason}
                      onChangeText={setReason}
                      placeholder="Mis. uang kembalian kurang, staff ganti besok"
                      multiline
                      maxLength={500}
                    />
                  ) : null}
                </Card>

                {error ? <Banner tone="danger" message={error} /> : null}

                <Button
                  label="Terima Setoran"
                  icon="cash-check"
                  onPress={() => void submitMoney()}
                  loading={record.isPending}
                  disabled={record.isPending || declared <= 0}
                />
              </>
            ) : (
              <>
                <Banner
                  tone="success"
                  message="Uang sudah tercatat. Sekarang pisahkan cups yang masih layak dari yang harus dibuang."
                />

                {remainingLines.length === 0 ? (
                  <Card style={styles.card}>
                    <EmptyState
                      icon="cup-off-outline"
                      title="Tidak ada cups sisa"
                      subtitle="Gerobak ini habis terjual, atau sudah ditutup barista. Tinggal selesaikan setorannya."
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
  const queueQuery = useSettlementQueue();
  const [openCartId, setOpenCartId] = useState<number | null>(null);

  const rows = queueQuery.data ?? [];
  const open = rows.find((row) => row.cart_id === openCartId) ?? null;
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
            title="Belum ada gerobak bertugas hari ini"
            subtitle="Antrean setoran terisi setelah barista menyerahkan cups ke gerobak."
            tone="neutral"
          />
        </Card>
      ) : (
        <>
          <SectionTitle title="Antrean hari ini" caption={`${rows.length} gerobak`} />

          {rows.map((row) => {
            const done = row.settlement_id !== null;

            return (
              <Touchable
                key={row.cart_id}
                onPress={() => setOpenCartId(row.cart_id)}
                accessibilityRole="button"
                accessibilityLabel={`Setoran gerobak ${row.cart_code}`}
                style={[styles.queueRow, done && styles.queueRowDone]}
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
                    {row.cart_code} · {row.staff_name ?? '-'}
                  </Text>
                  <Text variant="caption" color={semantic.textMuted} numberOfLines={1}>
                    {row.cups_sold} cups terjual · sisa {row.cups_remaining} · {rupiah(row.expected_total)}
                  </Text>
                </View>

                <Chip
                  tone={done ? 'brand' : 'neutral'}
                  label={done ? (row.settlement_status === 'RECONCILED' ? 'Selesai' : 'Uang masuk') : 'Menunggu'}
                />
              </Touchable>
            );
          })}
        </>
      )}

      <Modal visible={open !== null} animationType="slide" onRequestClose={() => setOpenCartId(null)}>
        {open ? <DepositSheet row={open} onClose={() => setOpenCartId(null)} /> : null}
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

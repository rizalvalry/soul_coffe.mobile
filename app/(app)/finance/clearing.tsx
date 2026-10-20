import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Banner } from '@/components/ui/Banner';
import { Touchable } from '@/components/ui/Touchable';
import { useAuth } from '@/features/auth/store';
import { clearClearingAttempt, loadOrCreateClearingAttempt, readClearingAttempt } from '@/features/clearing/attempt';
import { useClearingOptions, useClearingReceipts, useMatchClearing, useRecordClearing, useVoidClearing, type ClearingInput } from '@/features/clearing/queries';
import { ApiError, uuidv4 } from '@/lib/api';
import { brand, semantic, space } from '@/theme';

function todayLocal(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function digits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 13);
}

function money(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

export default function FinanceClearingScreen() {
  const router = useRouter();
  const ownerId = String(useAuth((state) => state.session?.user.id ?? ''));
  const options = useClearingOptions();
  const receipts = useClearingReceipts();
  const record = useRecordClearing();
  const voidReceipt = useVoidClearing();
  const matchReceipt = useMatchClearing();
  const attempt = useRef<Promise<ClearingInput> | null>(null);
  const recordInFlight = useRef(false);
  const voidKey = useRef<{ id: number; reason: string; key: string } | null>(null);
  const matchKey = useRef<{ id: number; sale_dates: string[]; uuid: string } | null>(null);

  const [date, setDate] = useState(todayLocal());
  const [amount, setAmount] = useState('');
  const [mdr, setMdr] = useState('0');
  const [dates, setDates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [voidId, setVoidId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [matchId, setMatchId] = useState<number | null>(null);
  const [matchDates, setMatchDates] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [canCancelDraft, setCanCancelDraft] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    void readClearingAttempt(ownerId).then((saved) => {
      if (!active || !saved) return;
      attempt.current = Promise.resolve(saved);
      setDate(saved.received_on);
      setAmount(String(saved.amount_minor));
      setMdr(String(saved.mdr_minor));
      setDates(saved.sale_dates);
      setLocked(true);
      setCanCancelDraft(false);
      setError('Dana tadi belum pasti masuk. Coba kirim lagi pakai data yang sama ya.');
    }).catch(() => {
      if (active) setError('Draft dana masuk belum bisa dibaca. Coba lagi ya.');
    });
    return () => { active = false; };
  }, [ownerId]);

  const submit = async () => {
    setError(null);
    if (!ownerId || !options.data?.bank_account_id) {
      setError('Rekening Bank belum siap. Muat ulang layar ini ya.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(amount || '0') < 1) {
      setError('Isi tanggal YYYY-MM-DD dan nominal dana masuk lebih dari 0 ya.');
      return;
    }
    if (recordInFlight.current) return;
    recordInFlight.current = true;
    try {
      if (!attempt.current) {
        attempt.current = loadOrCreateClearingAttempt(ownerId, {
          received_on: date, amount_minor: Number(amount), mdr_minor: Number(mdr || '0'),
          bank_account_id: options.data.bank_account_id, sale_dates: [...dates].sort(),
        });
      }
      const saved = await attempt.current;
      setLocked(true);
      setCanCancelDraft(false);
      await record.mutateAsync(saved);
      await clearClearingAttempt(ownerId);
      attempt.current = null;
      setLocked(false);
      setCanCancelDraft(false);
      setAmount('');
      setMdr('0');
      setDates([]);
      Alert.alert('Dana masuk tercatat', 'Dana bank, MDR, dan kliring sudah masuk jurnal.');
    } catch (cause) {
      // A validation response means the server rejected the write. A timeout or
      // server error may mean it committed, so only the original key can be retried.
      setCanCancelDraft(cause instanceof ApiError && cause.isValidation);
      setError(cause instanceof ApiError ? cause.message : 'Dana belum bisa dikirim. Coba lagi ya.');
    } finally {
      recordInFlight.current = false;
    }
  };

  const cancelDraft = async () => {
    if (!canCancelDraft || recordInFlight.current || record.isPending) return;
    recordInFlight.current = true;
    try {
      await clearClearingAttempt(ownerId);
      attempt.current = null;
      setLocked(false);
      setCanCancelDraft(false);
      setError(null);
    } catch {
      setError('Draft belum bisa dibatalkan. Coba lagi ya.');
    } finally {
      recordInFlight.current = false;
    }
  };

  const confirmVoid = async () => {
    if (voidId === null || !voidReason.trim()) {
      setError('Isi alasan pembatalan dulu ya.');
      return;
    }
    try {
      if (!voidKey.current || voidKey.current.id !== voidId || voidKey.current.reason !== voidReason.trim()) {
        voidKey.current = { id: voidId, reason: voidReason.trim(), key: uuidv4() };
      }
      await voidReceipt.mutateAsync(voidKey.current);
      voidKey.current = null;
      setVoidId(null);
      setVoidReason('');
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Pembatalan belum berhasil. Coba lagi ya.');
    }
  };

  const toggleDate = (saleDate: string) => {
    if (locked) return;
    setDates((current) => current.includes(saleDate)
      ? current.filter((item) => item !== saleDate)
      : [...current, saleDate]);
  };

  const submitMatch = async () => {
    if (matchId === null || matchDates.length === 0) {
      setError('Pilih minimal satu hari penjualan ya.');
      return;
    }
    try {
      const selected = [...matchDates].sort();
      if (!matchKey.current || matchKey.current.id !== matchId
        || JSON.stringify(matchKey.current.sale_dates) !== JSON.stringify(selected)) {
        matchKey.current = { id: matchId, sale_dates: selected, uuid: uuidv4() };
      }
      await matchReceipt.mutateAsync(matchKey.current);
      matchKey.current = null;
      setMatchId(null);
      setMatchDates([]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Hari penjualan belum bisa dipasangkan. Coba lagi ya.');
    }
  };

  const aging = options.data?.aging;

  return (
    <Screen refreshing={options.isRefetching || receipts.isRefetching} onRefresh={() => {
      void options.refetch();
      void receipts.refetch();
    }}>
      <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
      <Text variant="h2">Dana QRIS/transfer masuk</Text>
      <Text variant="caption" color={semantic.textMuted}>Catat saat dana sudah masuk di rekening Bank.</Text>

      <Card style={styles.card}>
        <Text variant="bodyStrong">Catat dana masuk</Text>
        <Input label="Tanggal dana masuk (YYYY-MM-DD)" value={date} onChangeText={setDate} editable={!locked} placeholder="YYYY-MM-DD" />
        <Input label="Nominal masuk rekening (Rp)" value={amount} onChangeText={(value) => setAmount(digits(value))}
          editable={!locked} keyboardType="number-pad" placeholder="0" />
        <Input label="Biaya MDR (Rp, opsional)" value={mdr} onChangeText={(value) => setMdr(digits(value))}
          editable={!locked} keyboardType="number-pad" placeholder="0" />
        <Text variant="caption" color={semantic.textMuted}>Rekening tujuan: Bank. Total kliring yang ditutup: {money(Number(amount || '0') + Number(mdr || '0'))}.</Text>
        <Text variant="bodyStrong">Hari penjualan yang dicakup</Text>
        <Text variant="caption" color={semantic.textMuted}>Boleh pilih beberapa hari, atau biarkan tidak dipilih kalau belum tahu.</Text>
        {aging?.rows.map((row) => (
          <Touchable key={row.sale_date} accessibilityRole="checkbox" accessibilityState={{ checked: dates.includes(row.sale_date), disabled: locked }}
            accessibilityLabel={`${row.sale_date}, sisa ${money(row.outstanding_minor)}`}
            onPress={() => toggleDate(row.sale_date)} style={styles.dateRow}>
            <Text variant="bodyStrong" color={dates.includes(row.sale_date) ? brand[700] : undefined}>
              {dates.includes(row.sale_date) ? '✓ ' : ''}{row.sale_date} · {money(row.outstanding_minor)}
            </Text>
          </Touchable>
        ))}
        {dates.length === 0 ? <Text variant="caption" color={semantic.textMuted}>Tidak dipilih</Text> : null}
        {error ? <Banner tone="danger" message={error} /> : null}
        {locked && canCancelDraft ? <Button label="Batalin draft yang ditolak" variant="secondary" onPress={() => void cancelDraft()} /> : null}
        <Button label="Catat dana masuk" icon="bank-transfer-in" loading={record.isPending} onPress={() => void submit()} />
      </Card>

      <Card style={styles.card}>
        <Text variant="bodyStrong">Umur saldo kliring</Text>
        <Text variant="caption">0–1 hari: {money(aging?.buckets['0_1_minor'] ?? 0)}</Text>
        <Text variant="caption">2–3 hari: {money(aging?.buckets['2_3_minor'] ?? 0)}</Text>
        <Text variant="caption" color={(aging?.buckets.over_3_minor ?? 0) > 0 ? '#B42318' : semantic.textMuted}>
          Lebih dari 3 hari: {money(aging?.buckets.over_3_minor ?? 0)}{(aging?.buckets.over_3_minor ?? 0) > 0 ? ' · Perlu dicek' : ''}
        </Text>
        <Text variant="caption">Dana belum dipasangkan: {money(aging?.unmatched_credit_minor ?? 0)}</Text>
        <Text variant="caption">Saldo lain/penyesuaian: {money(aging?.unattributed_minor ?? 0)}</Text>
        <Text variant="caption">Saldo akun kliring: {money(aging?.net_balance_minor ?? 0)}</Text>
      </Card>

      <Text variant="bodyStrong">Riwayat dana masuk</Text>
      {(receipts.data ?? []).map((receipt) => (
        <Card key={receipt.id} style={styles.card}>
          <Text variant="bodyStrong">{receipt.received_on.slice(0, 10)} · {money(receipt.amount_minor)}</Text>
          <Text variant="caption" color={semantic.textMuted}>MDR {money(receipt.mdr_minor)} · {receipt.status === 'POSTED' ? 'Tercatat' : 'Dibatalkan'}</Text>
          {receipt.status === 'POSTED' && receipt.amount_minor + receipt.mdr_minor > receipt.allocations.reduce((sum, row) => sum + row.amount_minor, 0)
            ? <Button label="Pasangkan hari" variant="secondary" onPress={() => { setMatchId(receipt.id); setMatchDates([]); }} /> : null}
          {receipt.status === 'POSTED' ? <Button label="Batalkan" variant="secondary" onPress={() => { setVoidId(receipt.id); setVoidReason(''); }} /> : null}
        </Card>
      ))}
      {matchId !== null ? (
        <Card style={styles.card}>
          <Text variant="bodyStrong">Pasangkan dana #{matchId} ke hari penjualan</Text>
          {(aging?.rows ?? []).map((row) => (
            <Touchable key={row.sale_date} accessibilityRole="checkbox" accessibilityState={{ checked: matchDates.includes(row.sale_date) }}
              accessibilityLabel={`${row.sale_date}, sisa ${money(row.outstanding_minor)}`}
              onPress={() => setMatchDates((current) => current.includes(row.sale_date)
                ? current.filter((date) => date !== row.sale_date) : [...current, row.sale_date])} style={styles.dateRow}>
              <Text variant="bodyStrong">{matchDates.includes(row.sale_date) ? '✓ ' : ''}{row.sale_date} · {money(row.outstanding_minor)}</Text>
            </Touchable>
          ))}
          <Button label="Simpan pasangan hari" loading={matchReceipt.isPending} onPress={() => void submitMatch()} />
          <Button label="Kembali" variant="secondary" onPress={() => setMatchId(null)} />
        </Card>
      ) : null}
      {voidId !== null ? (
        <Card style={styles.card}>
          <Text variant="bodyStrong">Batalkan dana masuk #{voidId}</Text>
          <Input label="Alasan pembatalan" value={voidReason} onChangeText={setVoidReason} placeholder="Ceritakan yang perlu dikoreksi" />
          <Button label="Batalkan dana masuk" variant="danger" loading={voidReceipt.isPending} onPress={() => void confirmVoid()} />
          <Button label="Kembali" variant="secondary" onPress={() => setVoidId(null)} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  dateRow: { paddingVertical: space.sm },
});

import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Banner } from '@/components/ui/Banner';
import { Chip } from '@/components/ui/Badge';
import { Appear } from '@/components/ui/Motion';
import { Touchable } from '@/components/ui/Touchable';
import { digits, useFinanceClearingController } from '@/features/clearing/financeController';
import { brand, radius, semantic, space } from '@/theme';

function money(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

export default function FinanceClearingScreen() {
  const router = useRouter();
  const {
    options, receipts, record, voidReceipt, matchReceipt, date, setDate,
    amount, setAmount, mdr, setMdr, dates, error, voidId, setVoidId,
    voidReason, setVoidReason, matchId, setMatchId, matchDates, setMatchDates,
    locked, canCancelDraft, submit, cancelDraft, confirmVoid, toggleDate, submitMatch, aging,
  } = useFinanceClearingController();

  return (
    <Screen refreshing={options.isRefetching || receipts.isRefetching} onRefresh={() => {
      void options.refetch();
      void receipts.refetch();
    }}>
      <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
      <View style={styles.header}>
        <Text variant="h2" color={semantic.textInverse}>Dana QRIS/transfer masuk</Text>
        <Text variant="caption" color={semantic.textInverse}>Catat saat dana sudah masuk di rekening Bank.</Text>
      </View>

      <Appear index={0}><Card style={styles.card}>
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
      </Card></Appear>

      <Appear index={1}><Card style={[styles.card, styles.agingCard]}>
        <Text variant="bodyStrong">Umur saldo kliring</Text>
        <Text variant="caption">0–1 hari: {money(aging?.buckets['0_1_minor'] ?? 0)}</Text>
        <Text variant="caption">2–3 hari: {money(aging?.buckets['2_3_minor'] ?? 0)}</Text>
        <Text variant="caption" color={(aging?.buckets.over_3_minor ?? 0) > 0 ? '#B42318' : semantic.textMuted}>
          Lebih dari 3 hari: {money(aging?.buckets.over_3_minor ?? 0)}{(aging?.buckets.over_3_minor ?? 0) > 0 ? ' · Perlu dicek' : ''}
        </Text>
        <Text variant="caption">Dana belum dipasangkan: {money(aging?.unmatched_credit_minor ?? 0)}</Text>
        <Text variant="caption">Saldo lain/penyesuaian: {money(aging?.unattributed_minor ?? 0)}</Text>
        <Text variant="caption">Saldo akun kliring: {money(aging?.net_balance_minor ?? 0)}</Text>
      </Card></Appear>

      <Text variant="bodyStrong">Riwayat dana masuk</Text>
      {(receipts.data ?? []).map((receipt, index) => (
        <Appear key={receipt.id} index={index + 2}><Card style={styles.card}>
          <Text variant="bodyStrong">{receipt.received_on.slice(0, 10)} · {money(receipt.amount_minor)}</Text>
          <View style={styles.receiptStatus}>
            <Text variant="caption" color={semantic.textMuted}>MDR {money(receipt.mdr_minor)} ·</Text>
            <Chip tone={receipt.status === 'POSTED' ? 'brand' : 'neutral'} label={receipt.status === 'POSTED' ? 'Tercatat' : 'Dibatalkan'} />
          </View>
          {receipt.status === 'POSTED' && receipt.amount_minor + receipt.mdr_minor > receipt.allocations.reduce((sum, row) => sum + row.amount_minor, 0)
            ? <Button label="Pasangkan hari" variant="secondary" onPress={() => { setMatchId(receipt.id); setMatchDates([]); }} /> : null}
          {receipt.status === 'POSTED' ? <Button label="Batalkan" variant="secondary" onPress={() => { setVoidId(receipt.id); setVoidReason(''); }} /> : null}
        </Card></Appear>
      ))}
      {matchId !== null ? (
        <Appear><Card style={styles.card}>
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
        </Card></Appear>
      ) : null}
      {voidId !== null ? (
        <Appear><Card style={styles.card}>
          <Text variant="bodyStrong">Batalkan dana masuk #{voidId}</Text>
          <Input label="Alasan pembatalan" value={voidReason} onChangeText={setVoidReason} placeholder="Ceritakan yang perlu dikoreksi" />
          <Button label="Batalkan dana masuk" variant="danger" loading={voidReceipt.isPending} onPress={() => void confirmVoid()} />
          <Button label="Kembali" variant="secondary" onPress={() => setVoidId(null)} />
        </Card></Appear>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  header: {
    gap: space.xs,
    backgroundColor: brand[700],
    borderRadius: radius?.card ?? 24,
    padding: space.xl,
  },
  agingCard: { backgroundColor: semantic.surfaceSunken },
  receiptStatus: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  dateRow: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    backgroundColor: semantic.bg,
    borderRadius: radius?.md ?? 14,
  },
});

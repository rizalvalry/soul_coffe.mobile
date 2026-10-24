import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ProductThumbnail } from '@/components/ui/ProductThumbnail';
import { useClosingController } from '@/features/closing/useClosingController';
import { semantic, space } from '@/theme';

export default function RiderClosingScreen() {
  const { draft, record, oldSales, remaining, setRemaining, wasted, setWasted, qris, setQris,
    transfer, setTransfer, note, setNote, error, needsFreshDraft, showCorrection,
    setShowCorrection, totals, productById, submit, rupiah, commissionSummary } = useClosingController();

  return (
    <Screen refreshing={draft.isRefetching} onRefresh={() => void draft.refetch()}>
      <Text variant="h2">Closing</Text>
      <Text variant="caption" color={semantic.textMuted}>Isi sisa cups pas kamu selesai jualan ya.</Text>
      {draft.isLoading ? <SkeletonList count={4} lines={2} /> : draft.isError ? (
        <EmptyState icon="wifi-off" title="Closing belum bisa dibuka" subtitle={(draft.error as Error).message} tone="danger">
          <Button label="Coba lagi" onPress={() => void draft.refetch()} />
        </EmptyState>
      ) : draft.data ? (
        <>
          <Card style={styles.card}>
            <Text variant="bodyStrong">Coffee Bike {draft.data.cart_code}</Text>
            <Text variant="caption" color={semantic.textMuted}>Stok masuk diambil dari Add Stock, refill yang sudah diterima, dan koreksi penjualan kantor bila ada.</Text>
            {draft.data.carry_warning ? <Banner tone="warning" message="Ada sisa kemarin di Coffee Bike. Angkanya ikut dihitung dan Finance bisa lihat tandanya ya." /> : null}
            {!draft.data.can_correct ? <Banner tone="info" message="Setoran sudah di-approve Finance. Kalau ada koreksi, minta Finance bantu ya." /> : null}
          </Card>
          {(!draft.data.closing_id || showCorrection) ? <>
          {draft.data.lines.map((line) => {
            const sold = totals.soldByProduct[line.product_id] ?? 0;
            return (
              <Card key={line.product_id} style={styles.card}>
                <View style={styles.productHead}>
                  <ProductThumbnail product={productById.get(line.product_id) ?? {}} size={48} />
                  <View style={styles.productText}>
                    <Text variant="bodyStrong">{line.product_name}</Text>
                    <Text variant="caption" color={semantic.textMuted}>
                      Stok masuk {line.qty_in} cups{line.qty_carry > 0 ? ' · Sisa kemarin ' + line.qty_carry : ''}
                    </Text>
                    {line.qty_office_sold > 0 ? (
                      <Text variant="caption" color={semantic.textMuted}>Dijual kantor {line.qty_office_sold} cups</Text>
                    ) : null}
                  </View>
                </View>
                <Input label="Sisa cups" keyboardType="number-pad" value={remaining[line.product_id] ?? ''}
                  editable={draft.data.can_correct} onChangeText={(value) => setRemaining((old) => ({ ...old, [line.product_id]: value }))} />
                <Input label="Rusak / tumpah (opsional)" keyboardType="number-pad" value={wasted[line.product_id] ?? ''}
                  editable={draft.data.can_correct} onChangeText={(value) => setWasted((old) => ({ ...old, [line.product_id]: value }))} />
                <Text variant="caption" color={semantic.textMuted}>
                  Terjual {sold < 0 ? '—' : sold} cups · {rupiah(Math.max(0, sold) * line.unit_price_minor)}
                </Text>
              </Card>
            );
          })}
          <Card style={styles.card}>
            <Text variant="bodyStrong">Ringkasan Closing</Text>
            <Text variant="body">Terjual {totals.cupsSold} cups · Nilai jual {rupiah(Math.max(0, totals.total))}</Text>
            <Input label="Total QRIS (Rp)" keyboardType="number-pad" value={qris}
              editable={draft.data.can_correct} onChangeText={setQris} />
            <Input label="Total transfer (Rp)" keyboardType="number-pad" value={transfer}
              editable={draft.data.can_correct} onChangeText={setTransfer} />
            <Input label="Catatan lapangan (opsional)" value={note} onChangeText={setNote}
              maxLength={500} multiline editable={draft.data.can_correct}
              placeholder="Contoh: butuh es batu 2 pack, sedotan habis" />
            <Text variant="bodyStrong">Tunai yang harus disetor: {rupiah(Math.max(0, totals.cash))}</Text>
            {!totals.valid ? <Banner tone="warning" message="Cek lagi angka sisa, rusak, QRIS, dan transfer ya." /> : null}
            {error ? <Banner tone="danger" message={error} /> : null}
            <Button label={needsFreshDraft ? 'Muat ulang angka Closing' : draft.data.closing_id ? 'Kirim koreksi Closing' : 'Kirim Closing'}
              onPress={submit} loading={record.isPending}
              disabled={(!needsFreshDraft && !totals.valid) || !draft.data.can_correct || record.isPending} />
          </Card>
          </> : null}
          {draft.data.closing_id ? (
            <Card style={styles.card}>
              <Text variant="bodyStrong">Hasil Closing tersimpan</Text>
              <Text variant="bodyStrong">{commissionSummary(draft.data.commission).earned}</Text>
              {commissionSummary(draft.data.commission).progress ? (
                <Text variant="caption" color={semantic.textMuted}>{commissionSummary(draft.data.commission).progress}</Text>
              ) : null}
              {draft.data.lines.map((line) => (
                <View key={line.product_id}>
                  <Text variant="caption">{line.product_name}: {line.qty_sold} terjual · {rupiah(line.subtotal_minor)}</Text>
                  {line.qty_office_sold > 0 ? <Text variant="caption">Dijual kantor {line.qty_office_sold} cups</Text> : null}
                </View>
              ))}
              <Text variant="bodyStrong">Total {rupiah(draft.data.total_minor)} · Tunai {rupiah(draft.data.cash_minor)}</Text>
              {draft.data.note ? <Text variant="body">Catatan: {draft.data.note}</Text> : null}
              {draft.data.can_correct ? <Button label="Ada pembeli lagi? Ubah sisa cups" variant="secondary" onPress={() => setShowCorrection(true)} /> : null}
            </Card>
          ) : null}
        </>
      ) : null}
      {oldSales.queue.length > 0 || oldSales.rejected.length > 0 || oldSales.legacyCount > 0 ? (
        <Card style={styles.card}>
          <Text variant="bodyStrong">Antrean penjualan lama</Text>
          <Text variant="caption" color={semantic.textMuted}>
            {oldSales.queue.length} menunggu dikirim · {oldSales.rejected.length} perlu dicek · {oldSales.legacyCount} dari versi lama.
          </Text>
          {oldSales.lastFailure ? <Banner tone="warning" message={oldSales.lastFailure} /> : null}
          {oldSales.rejected.map((entry) => (
            <Text key={entry.uuid} variant="caption" color={semantic.textMuted}>{entry.rejection}</Text>
          ))}
          {oldSales.queue.length > 0 ? <Button label="Kirim antrean lama" variant="secondary" onPress={() => void oldSales.flushNow()} loading={oldSales.flushing} /> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  productHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  productText: { flex: 1, gap: space.xxs },
});

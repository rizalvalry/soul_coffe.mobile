import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useProducts } from '@/features/refill/queries';
import { productImageSource } from '@/domain/productImages';
import { useClosingDraft, useRecordClosing } from '@/features/closing/queries';
import { closingTotals } from '@/features/closing/calculation';
import { closingSubmissionGate } from '@/features/closing/submissionGate';
import { useOfflineSalesQueue } from '@/features/sales/useOfflineSalesQueue';
import { ApiError, uuidv4 } from '@/lib/api';
import { brand, semantic, space } from '@/theme';

function amount(text: string): number {
  return /^\d+$/.test(text) ? Number(text) : text === '' ? 0 : -1;
}
function rupiah(value: number): string {
  return 'Rp ' + value.toLocaleString('id-ID');
}
async function closingGps(): Promise<{ lat: number; lng: number } | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.LocationAccuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    return fix ? { lat: fix.coords.latitude, lng: fix.coords.longitude } : null;
  } catch {
    return null;
  }
}

export default function RiderClosingScreen() {
  const draft = useClosingDraft();
  const products = useProducts();
  const record = useRecordClosing();
  const oldSales = useOfflineSalesQueue();
  const [remaining, setRemaining] = useState<Record<number, string>>({});
  const [wasted, setWasted] = useState<Record<number, string>>({});
  const [qris, setQris] = useState('0');
  const [transfer, setTransfer] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [needsFreshDraft, setNeedsFreshDraft] = useState(false);
  const retry = useRef<{ key: string; signature: string; gps: { lat: number; lng: number } | null } | null>(null);

  useEffect(() => {
    if (!draft.data) return;
    setRemaining(Object.fromEntries(draft.data.lines.map((line) => [
      line.product_id, String(draft.data?.closing_id ? line.qty_remaining : line.qty_in + line.qty_carry),
    ])));
    setWasted(Object.fromEntries(draft.data.lines.map((line) => [line.product_id, String(line.qty_wasted)])));
    setQris(String(draft.data.qris_minor));
    setTransfer(String(draft.data.transfer_minor));
  }, [draft.data]);

  const counts = useMemo(
    () => Object.fromEntries(Object.entries(remaining).map(([id, value]) => [Number(id), amount(value)])),
    [remaining],
  );
  const wasteCounts = useMemo(
    () => Object.fromEntries(Object.entries(wasted).map(([id, value]) => [Number(id), amount(value)])),
    [wasted],
  );
  const totals = closingTotals(draft.data?.lines ?? [], counts, wasteCounts, amount(qris), amount(transfer));
  const productById = new Map((products.data ?? []).map((product) => [product.id, product]));

  const submit = async () => {
    if (!draft.data || !draft.data.can_correct || (!needsFreshDraft && !totals.valid)) return;
    try {
      if (needsFreshDraft) {
        const refresh = await closingSubmissionGate({ ready: true, hadPending: true }, () => draft.refetch());
        if (refresh === 'review') {
          setNeedsFreshDraft(false);
          setError('Angka Closing sudah diperbarui. Cek lagi sebelum kirim ya.');
        } else {
          setError('Angka Closing terbaru belum bisa dibuka. Coba lagi ya.');
        }
        return;
      }
      const sync = await oldSales.syncBeforeClosing();
      const gate = await closingSubmissionGate(sync, () => draft.refetch());
      if (gate === 'pending') {
        setError('Antrean penjualan lama masih menunggu dikirim. Sambungkan internet, lalu coba lagi ya.');
        return;
      }
      if (gate === 'refresh_failed') {
        setNeedsFreshDraft(true);
        setError('Antrean lama sudah terkirim, tapi angka Closing terbaru belum bisa dibuka. Coba lagi ya.');
        return;
      }
      if (gate === 'review') {
        setError('Antrean lama sudah terkirim. Cek lagi angka Closing yang baru, lalu kirim ya.');
        return;
      }
    } catch {
      setError('Antrean lama belum bisa dicek. Coba lagi ya.');
      return;
    }
    const lines = draft.data.lines.map((line) => ({
      product_id: line.product_id,
      qty_remaining: counts[line.product_id] ?? 0,
      qty_wasted: wasteCounts[line.product_id] ?? 0,
    }));
    const signature = JSON.stringify([draft.data.cart_id, lines, amount(qris), amount(transfer)]);
    Alert.alert(
      draft.data.closing_id ? 'Koreksi Closing?' : 'Kirim Closing?',
      String(totals.cupsSold) + ' cups terjual. Tunai yang harus disetor ' + rupiah(totals.cash) + '.',
      [
        { text: 'Cek lagi', style: 'cancel' },
        { text: 'Kirim', onPress: async () => {
          setError(null);
          const attempt = retry.current?.signature === signature
            ? retry.current
            : { key: uuidv4(), signature, gps: await closingGps() };
          retry.current = attempt;
          try {
            await record.mutateAsync({
              key: attempt.key, lines, qris: amount(qris), transfer: amount(transfer), gps: attempt.gps,
            });
            retry.current = null;
            Alert.alert('Closing tersimpan', 'Hasilnya sudah bisa dicek Finance ya.');
          } catch (e) {
            if (e instanceof ApiError && !e.isOffline) retry.current = null;
            setError(e instanceof ApiError ? e.message : 'Closing belum terkirim. Coba lagi ya.');
          }
        } },
      ],
    );
  };

  return (
    <Screen refreshing={draft.isRefetching} onRefresh={() => void draft.refetch()}>
      <Text variant="h2">Closing</Text>
      <Text variant="caption" color={semantic.textMuted}>Isi sisa cups pas mau balik ke dapur.</Text>
      {draft.isLoading ? <SkeletonList count={4} lines={2} /> : draft.isError ? (
        <EmptyState icon="wifi-off" title="Closing belum bisa dibuka" subtitle={(draft.error as Error).message} tone="danger">
          <Button label="Coba lagi" onPress={() => void draft.refetch()} />
        </EmptyState>
      ) : draft.data ? (
        <>
          <Card style={styles.card}>
            <Text variant="bodyStrong">Gerobak {draft.data.cart_code}</Text>
            <Text variant="caption" color={semantic.textMuted}>Stok masuk diambil dari Add Stock dan refill yang sudah diterima.</Text>
            {draft.data.carry_warning ? <Banner tone="warning" message="Ada sisa kemarin di gerobak. Angkanya ikut dihitung dan Finance bisa lihat tandanya ya." /> : null}
            {!draft.data.can_correct ? <Banner tone="info" message="Setoran sudah di-approve Finance. Kalau ada koreksi, minta Finance bantu ya." /> : null}
          </Card>
          {draft.data.lines.map((line) => {
            const image = productImageSource(productById.get(line.product_id) ?? {});
            const sold = totals.soldByProduct[line.product_id] ?? 0;
            return (
              <Card key={line.product_id} style={styles.card}>
                <View style={styles.productHead}>
                  {image ? <Image source={image} style={styles.image} /> : null}
                  <View style={styles.productText}>
                    <Text variant="bodyStrong">{line.product_name}</Text>
                    <Text variant="caption" color={semantic.textMuted}>
                      Stok masuk {line.qty_in} cups{line.qty_carry > 0 ? ' · Sisa kemarin ' + line.qty_carry : ''}
                    </Text>
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
            <Text variant="bodyStrong">Tunai yang harus disetor: {rupiah(Math.max(0, totals.cash))}</Text>
            {!totals.valid ? <Banner tone="warning" message="Cek lagi angka sisa, rusak, QRIS, dan transfer ya." /> : null}
            {error ? <Banner tone="danger" message={error} /> : null}
            <Button label={needsFreshDraft ? 'Muat ulang angka Closing' : draft.data.closing_id ? 'Kirim koreksi Closing' : 'Kirim Closing'}
              onPress={submit} loading={record.isPending}
              disabled={(!needsFreshDraft && !totals.valid) || !draft.data.can_correct || record.isPending} />
          </Card>
          {draft.data.closing_id ? (
            <Card style={styles.card}>
              <Text variant="bodyStrong">Hasil Closing tersimpan</Text>
              {draft.data.lines.map((line) => (
                <Text key={line.product_id} variant="caption">
                  {line.product_name}: {line.qty_sold} terjual · {rupiah(line.subtotal_minor)}
                </Text>
              ))}
              <Text variant="bodyStrong">Total {rupiah(draft.data.total_minor)} · Tunai {rupiah(draft.data.cash_minor)}</Text>
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
  image: { width: 48, height: 48, borderRadius: 8, backgroundColor: brand[50] },
});

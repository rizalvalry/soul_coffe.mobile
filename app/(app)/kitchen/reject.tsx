import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { Touchable } from '@/components/ui/Touchable';
import { useAuth } from '@/features/auth/store';
import { useProducts } from '@/features/refill/queries';
import { useKitchenSelection } from '@/features/showcase/kitchenSelection';
import { kitchenOperationKey } from '@/features/showcase/operationKey';
import { validateKitchenReject, type RejectLine, type RejectReason } from '@/features/kitchenReject/validation';
import { request, uploadFile } from '@/lib/api';
import { compressForUpload } from '@/lib/image';
import { brand, radius, semantic, space } from '@/theme';

type Kitchen = { id: number; name: string };
type Stock = { product_id: number; product_name: string; qty: number };
type Reject = { id: number; status: string; reason_code: RejectReason; created_at: string;
  lines: { product_id: number; product_name: string; qty: number }[] };
type Photo = { uri: string; takenAt: string };

const REASONS: { code: RejectReason; label: string }[] = [
  { code: 'DROPPED', label: 'Jatuh / tumpah' },
  { code: 'PACKAGING', label: 'Kemasan rusak' },
  { code: 'QUALITY', label: 'Kualitas tidak layak' },
  { code: 'OTHER', label: 'Lainnya' },
];

export default function KitchenRejectScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const user = useAuth((s) => s.session?.user);
  const isProduction = user?.role === 'BARISTA';
  const { kitchenId, loaded, load, select } = useKitchenSelection();
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setQty({}); setReason(null); setNote(''); setPhoto(null); setError(null);
  }, [kitchenId]);

  useEffect(() => { if (!isProduction) void load(); }, [isProduction, load]);
  const kitchens = useQuery({ queryKey: ['kitchen-rejects', 'kitchens'],
    queryFn: () => request<Kitchen[]>('/kitchen-rejects/kitchens'), enabled: !isProduction });
  useEffect(() => {
    if (isProduction || !loaded || !kitchens.data) return;
    if (kitchens.data.length === 1 && kitchenId !== kitchens.data[0]?.id) void select(kitchens.data[0]!.id);
    else if (kitchenId !== null && !kitchens.data.some((kitchen) => kitchen.id === kitchenId)) void select(null);
  }, [isProduction, loaded, kitchens.data, kitchenId, select]);
  const ready = isProduction || (loaded && !!kitchenId);
  const stock = useQuery({ queryKey: ['kitchen-rejects', 'stock', isProduction ? user?.kitchenId : kitchenId],
    queryFn: () => request<Stock[]>('/kitchen-rejects/stock', { kitchen: true }), enabled: ready });
  const history = useQuery({ queryKey: ['kitchen-rejects', 'history', isProduction ? user?.kitchenId : kitchenId],
    queryFn: () => request<Reject[]>('/kitchen-rejects', { kitchen: true }), enabled: ready });
  const products = useProducts();
  const stockMap = useMemo(() => Object.fromEntries((stock.data ?? []).map((row) => [row.product_id, row.qty])), [stock.data]);
  const choices = (products.data ?? []).filter((product) => product.is_sellable && stockMap[product.id] !== undefined);
  const lines: RejectLine[] = Object.entries(qty).filter(([, value]) => value > 0)
    .map(([id, value]) => ({ product_id: Number(id), qty: value }));

  const takePhoto = async () => {
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { setError('Aktifkan izin kamera dulu ya.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: false });
      if (!result.canceled && result.assets?.[0]) setPhoto({ uri: result.assets[0].uri, takenAt: new Date().toISOString() });
    } catch { setError('Kamera belum bisa dibuka. Coba lagi ya.'); }
  };

  const submit = async () => {
    setError(null);
    setSuccess(null);
    const problem = validateKitchenReject(lines, stockMap, reason, note, photo?.uri ?? null);
    if (problem) { setError(problem); return; }
    if (!photo || !reason) return;
    setSending(true);
    try {
      const image = await compressForUpload(photo.uri);
      const fields: Record<string, string> = { lines: JSON.stringify(lines), reason_code: reason,
        note: note.trim(), photo_taken_at: photo.takenAt };
      if (!isProduction && kitchenId) fields['kitchen_id'] = String(kitchenId);
      const operation = await kitchenOperationKey('/kitchen-rejects', { ...fields, photo_uri: photo.uri });
      const created = await uploadFile<Reject>('/kitchen-rejects',
        { uri: image.uri, name: 'reject.jpg', type: 'image/jpeg' }, fields, 'photo', operation.key);
      await operation.clear();
      setQty({}); setReason(null); setNote(''); setPhoto(null);
      setSuccess(created.status === 'NEEDS_REVIEW'
        ? 'Reject tercatat dan perlu ditinjau Finance.' : 'Reject tercatat. Stok showcase sudah diperbarui.');
      await Promise.all([client.invalidateQueries({ queryKey: ['kitchen-rejects'] }),
        client.invalidateQueries({ queryKey: ['showcase', 'stock'] })]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reject belum terkirim. Coba lagi ya.');
    } finally { setSending(false); }
  };

  return (
    <Screen refreshing={stock.isRefetching || history.isRefetching}
      onRefresh={() => { void stock.refetch(); void history.refetch(); }}>
      <View style={styles.row}>
        <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
        <Text variant="h2">Catat Reject Dapur</Text>
      </View>
      {!isProduction && !ready ? <Card style={styles.block}>
        <Text variant="bodyStrong">Pilih Dapur Pusat</Text>
        {kitchens.data?.map((kitchen) => <Button key={kitchen.id} label={kitchen.name}
          variant="secondary" onPress={() => void select(kitchen.id)} />)}
        {kitchens.isError ? <Banner message="Daftar dapur belum bisa dimuat. Coba lagi ya." /> : null}
      </Card> : null}
      {ready ? <>
        {!isProduction ? <Button label="Ganti dapur" variant="ghost" onPress={() => void select(null)} /> : null}
        <Card style={styles.block}>
          <Text variant="bodyStrong">Produk yang rusak</Text>
          {stock.isError ? <Banner message="Stok showcase belum bisa dimuat. Coba lagi ya." /> : null}
          {choices.map((product) => <View key={product.id} style={styles.product}>
            <View style={styles.productLabel}>
              <Text variant="bodyStrong">{product.name}</Text>
              <Text variant="caption">Stok showcase: {stockMap[product.id] ?? 0} cups</Text>
            </View>
            <QtyStepper value={qty[product.id] ?? 0}
              onChange={(value) => setQty((old) => ({ ...old, [product.id]: value }))}
              max={Math.min(9999, Math.max(0, stockMap[product.id] ?? 0))} />
          </View>)}
        </Card>
        <Card style={styles.block}>
          <Text variant="bodyStrong">Alasan reject</Text>
          {REASONS.map((choice) => <Touchable key={choice.code} accessibilityRole="button"
            accessibilityLabel={choice.label} onPress={() => setReason(choice.code)}
            style={[styles.choice, reason === choice.code && styles.selected]}>
            <Text variant="bodyStrong">{choice.label}</Text>
          </Touchable>)}
          <Input label={reason === 'OTHER' ? 'Catatan wajib' : 'Catatan (opsional)'}
            value={note} onChangeText={setNote} maxLength={500} multiline />
        </Card>
        <Card style={styles.block}>
          <Text variant="bodyStrong">Foto bukti</Text>
          {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} /> : null}
          <Button label={photo ? 'Ambil ulang foto' : 'Ambil foto'} variant="secondary"
            onPress={() => void takePhoto()} />
        </Card>
        {error ? <Banner message={error} /> : null}
        {success ? <Banner tone="success" message={success} /> : null}
        <Button label="Kirim reject" loading={sending} disabled={!stock.isSuccess || !products.isSuccess}
          onPress={() => void submit()} />
        <Card style={styles.block}>
          <Text variant="bodyStrong">Reject hari ini</Text>
          {history.isError ? <Banner tone="info" message="Riwayat belum bisa dimuat untuk akses ini." /> : null}
          {history.data?.length === 0 ? <Text variant="caption">Belum ada reject hari ini.</Text> : null}
          {history.data?.map((item) => <View key={item.id} style={styles.history}>
            <Text variant="bodyStrong">{item.lines.map((line) => `${line.product_name} ${line.qty}`).join(', ')}</Text>
            <Text variant="caption">{REASONS.find((entry) => entry.code === item.reason_code)?.label ?? item.reason_code}
              {' · '}{item.status === 'NEEDS_REVIEW' ? 'Perlu ditinjau' : item.status === 'REVIEWED'
                ? 'Sudah ditinjau' : item.status === 'CORRECTED' ? 'Dikoreksi' : 'Tercatat'}</Text>
          </View>)}
        </Card>
      </> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  block: { gap: space.md },
  product: { gap: space.sm, paddingVertical: space.sm },
  productLabel: { gap: space.xs },
  choice: { padding: space.md, borderRadius: radius.md, backgroundColor: semantic.bg },
  selected: { borderWidth: 2, borderColor: brand[700] },
  photo: { width: '100%', height: 200, borderRadius: radius.md },
  history: { gap: space.xs, paddingVertical: space.sm },
});

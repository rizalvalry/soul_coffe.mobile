import { Image, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { Touchable } from '@/components/ui/Touchable';
import type { RejectReason } from '@/features/kitchenReject/validation';
import { useKitchenRejectController } from '@/features/kitchenReject/useKitchenRejectController';
import { brand, radius, semantic, space } from '@/theme';

const REASONS: { code: RejectReason; label: string }[] = [
  { code: 'DROPPED', label: 'Jatuh / tumpah' },
  { code: 'PACKAGING', label: 'Kemasan rusak' },
  { code: 'QUALITY', label: 'Kualitas tidak layak' },
  { code: 'OTHER', label: 'Lainnya' },
];

export default function KitchenRejectScreen() {
  const { router, isProduction, select, qty, setQty, reason, setReason, note, setNote,
    photo, error, success, sending, kitchens, ready, stock, history, products, stockMap, choices,
    takePhoto, submit } = useKitchenRejectController();

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

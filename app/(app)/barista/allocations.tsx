import { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { Banner } from '@/components/ui/Banner';
import { ProductThumbnail } from '@/components/ui/ProductThumbnail';
import { useKitchenStock, useProducts, useStaffOnShift } from '@/features/refill/queries';
import { useLocations } from '@/features/riderLocation/queries';
import { useCreateAllocation } from '@/features/showcase/queries';
import { MAX_PRODUCTION_QTY } from '@/features/showcase/quantity';
import { ApiError } from '@/lib/api';
import { space } from '@/theme';

function todayLocal(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function AllocationsScreen() {
  const roster = useStaffOnShift();
  const products = useProducts();
  const kitchenStock = useKitchenStock();
  const locations = useLocations();
  const create = useCreateAllocation();
  const [staffId, setStaffId] = useState<number | null>(null);
  const [fallbackLocationId, setFallbackLocationId] = useState<number | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const maxForProduct = (productId: number) => kitchenStock.data === undefined ? MAX_PRODUCTION_QTY : Math.min(
    Math.max(0, kitchenStock.data.find((row) => row.product_id === productId)?.on_hand ?? 0),
    MAX_PRODUCTION_QTY,
  );
  const stockShortages = Object.entries(qty).flatMap(([productId, amount]) => {
    const available = maxForProduct(Number(productId));
    if (amount <= available) return [];
    const productName = products.data?.find((product) => product.id === Number(productId))?.name ?? 'Produk';
    return [`${productName}: dipilih ${amount}, stok dapur ${available} cups`];
  });
  const selected = roster.data?.find((row) => row.staff_id === staffId);
  const locationId = selected?.location_id ?? fallbackLocationId;
  const lines = Object.entries(qty).filter(([, amount]) => amount > 0)
    .map(([productId, amount]) => ({ product_id: Number(productId), qty_issued: amount }));

  const submit = async () => {
    if (!selected || !locationId) return;
    setMessage(null);
    try {
      await create.mutateAsync({ operatingDate: todayLocal(), cartId: selected.cart_id,
        staffId: selected.staff_id, locationId, lines,
        ...(selected.has_allocation ? { correctionReason: reason.trim() } : {}) });
      setQty({});
      setReason('');
      setMessage('Alokasi tambahan sudah tercatat.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Alokasi belum berhasil. Coba lagi ya.');
    }
  };

  return (
    <Screen>
      <Text variant="h2">Alokasi Tambahan</Text>
      <Text variant="caption">Pilih Rider yang Coffee Bike-nya sudah diisi lewat Add Stock.</Text>
      {roster.isError ? <Banner tone="danger" message="Daftar Rider belum bisa dimuat. Coba lagi ya." /> : null}
      {roster.data?.length === 0 ? <Banner tone="info" message="Belum ada Coffee Bike yang diisi hari ini." /> : null}
      {roster.data?.map((row) => (
        <Card key={`${row.staff_id}-${row.cart_id}`} style={{ gap: space.sm }}>
          <Text variant="bodyStrong">{row.staff_name} · Coffee Bike {row.cart_code}</Text>
          <Button label={row.staff_id === staffId ? 'Dipilih' : 'Pilih'}
            variant="secondary" onPress={() => { setStaffId(row.staff_id); setQty({}); setFallbackLocationId(null); }} />
        </Card>
      ))}
      {selected ? (
        <View style={{ gap: space.md }}>
          <Text variant="h3">Tambah cups untuk {selected.staff_name}</Text>
          {selected.location_id ? <Text variant="caption">Lokasi: {selected.location_name}</Text> : (
            <>
              <Text variant="caption">Lokasi Rider belum tersimpan. Pilih lokasi untuk alokasi ini ya.</Text>
              {locations.data?.map((location) => (
                <Button key={location.id} label={location.name}
                  variant={fallbackLocationId === location.id ? 'primary' : 'secondary'}
                  onPress={() => setFallbackLocationId(location.id)} />
              ))}
            </>
          )}
          {products.data?.filter((product) => product.is_sellable).map((product) => (
            <Card key={product.id} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <ProductThumbnail product={product} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>{product.name}</Text>
              </View>
              <QtyStepper value={qty[product.id] ?? 0} max={maxForProduct(product.id)}
                onChange={(amount) => setQty((old) => ({ ...old, [product.id]: amount }))} />
            </Card>
          ))}
          {selected.has_allocation ? <Input label="Alasan koreksi" value={reason}
            onChangeText={setReason} placeholder="Kenapa ada alokasi tambahan?" /> : null}
          {stockShortages.length > 0 ? <Banner tone="warning"
            message={`Stok dapur berubah. ${stockShortages.join('; ')}. Ubah jumlahnya dulu ya.`} /> : null}
          {message ? <Banner tone={create.isError ? 'danger' : 'success'} message={message} /> : null}
          <Button label="Catat Alokasi" loading={create.isPending}
            disabled={!locationId || lines.length === 0 || stockShortages.length > 0 || (selected.has_allocation && reason.trim().length < 10)}
            onPress={() => void submit()} />
        </View>
      ) : null}
    </Screen>
  );
}

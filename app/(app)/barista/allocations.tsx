import { View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { Banner } from '@/components/ui/Banner';
import { ProductThumbnail } from '@/components/ui/ProductThumbnail';
import { useAllocationsController } from '@/features/showcase/useAllocationsController';
import { space } from '@/theme';

export default function AllocationsScreen() {
  const { roster, products, locations, create, staffId, selectStaff, fallbackLocationId,
    setFallbackLocationId, qty, setProductQty, reason, setReason, message, maxForProduct,
    stockShortages, selected, locationId, lines, submit } = useAllocationsController();

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
            variant="secondary" onPress={() => selectStaff(row.staff_id)} />
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
                onChange={(amount) => setProductQty(product.id, amount)} />
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

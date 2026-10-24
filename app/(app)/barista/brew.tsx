import { View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { Banner } from '@/components/ui/Banner';
import { ProductThumbnail } from '@/components/ui/ProductThumbnail';
import { useBrewController } from '@/features/showcase/useBrewController';
import { MAX_PRODUCTION_QTY } from '@/features/showcase/quantity';
import { space } from '@/theme';

export default function BrewScreen() {
  const { products, brew, quantities, setProductQty, message, lines, submit } = useBrewController();

  return (
    <Screen>
      <Text variant="h2">Brew</Text>
      <Text variant="caption">Masukkan jumlah cups yang baru diseduh.</Text>
      {products.isError ? <Banner tone="danger" message="Produk belum bisa dimuat. Coba lagi ya." /> : null}
      {products.isError ? <Button label="Coba Lagi" onPress={() => void products.refetch()} /> : null}
      {products.data?.filter((product) => product.is_sellable).map((product) => (
        <Card key={product.id} style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
            <ProductThumbnail product={product} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>{product.name}</Text>
          </View>
          <View style={{ alignSelf: 'flex-end' }}>
            <QtyStepper value={quantities[product.id] ?? 0}
              onChange={(qty) => setProductQty(product.id, qty)}
              max={MAX_PRODUCTION_QTY} />
          </View>
        </Card>
      ))}
      {message ? <Banner tone={brew.isError ? 'danger' : 'success'} message={message} /> : null}
      <Button label="Catat Brew" disabled={lines.length === 0} loading={brew.isPending} onPress={() => void submit()} />
    </Screen>
  );
}

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { useKitchenSelection } from '@/features/showcase/kitchenSelection';
import { request } from '@/lib/api';
import { space } from '@/theme';

type Kitchen = { id: number; name: string };

const actions: { label: string; route: Href }[] = [
  { label: 'Buka Absen Rider', route: '/absen' },
  { label: 'Brew', route: '/barista/brew' },
  { label: 'Add Stock', route: '/barista/add-stock' },
  { label: 'Alokasi Tambahan', route: '/barista/allocations' },
  { label: 'Permintaan Refill', route: '/barista/requests' },
  { label: 'Siapkan Pesanan', route: '/barista/preparing' },
  { label: 'Stok Dapur', route: '/barista/stock' },
];

export default function KitchenOperationsScreen() {
  const router = useRouter();
  const { kitchenId, loaded, load, select } = useKitchenSelection();
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const kitchens = useQuery({ queryKey: ['showcase', 'kitchens'],
    queryFn: () => request<Kitchen[]>('/showcase/kitchens') });

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (loaded && kitchenId && kitchens.data && !kitchens.data.some((k) => k.id === kitchenId)) {
      void select(null);
    }
  }, [loaded, kitchenId, kitchens.data, select]);

  const selected = kitchens.data?.find((k) => k.id === kitchenId);
  const choose = async (id: number) => {
    setSelectionError(null);
    try { await select(id); } catch { setSelectionError('Pilihan dapur belum bisa disimpan di HP. Coba lagi ya.'); }
  };

  return (
    <Screen>
      <Text variant="h2">Produksi</Text>
      <Text variant="caption">Pilih Dapur Pusat yang kamu bantu hari ini. Pilihan ini tersimpan di HP sampai kamu ganti.</Text>
      {kitchens.isError ? <Banner tone="danger" message="Daftar dapur belum bisa dimuat. Coba lagi ya." /> : null}
      {selectionError ? <Banner tone="danger" message={selectionError} /> : null}
      {kitchens.isError ? <Button label="Coba Lagi" onPress={() => void kitchens.refetch()} /> : null}
      {loaded ? kitchens.data?.map((kitchen) => (
        <Card key={kitchen.id} style={{ gap: space.sm }}>
          <Text variant="bodyStrong">{kitchen.name}</Text>
          <Button label={kitchen.id === kitchenId ? 'Dapur dipilih' : 'Pakai dapur ini'}
            variant={kitchen.id === kitchenId ? 'secondary' : 'primary'}
            onPress={() => void choose(kitchen.id)} />
        </Card>
      )) : null}
      {kitchens.data?.length === 0 ? <Banner tone="warning" message="Belum ada Dapur Pusat yang aktif." /> : null}
      {selected ? (
        <View style={{ gap: space.sm }}>
          <Text variant="h3">Alur di {selected.name}</Text>
          {actions.map((action) => (
            <Button key={action.label} label={action.label} variant="secondary"
              onPress={() => router.push(action.route)} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

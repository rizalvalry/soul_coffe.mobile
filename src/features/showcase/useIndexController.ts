import { useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useKitchenSelection } from '@/features/showcase/kitchenSelection';

export type Kitchen = { id: number; name: string };

const actions: { label: string; route: Href }[] = [
  { label: 'Buka Absen Rider', route: '/absen' },
  { label: 'Brew', route: '/barista/brew' },
  { label: 'Add Stock', route: '/barista/add-stock' },
  { label: 'Alokasi Tambahan', route: '/barista/allocations' },
  { label: 'Permintaan Refill', route: '/barista/requests' },
  { label: 'Siapkan Pesanan', route: '/barista/preparing' },
  { label: 'Stok Dapur', route: '/barista/stock' },
];

export function useIndexController(loadKitchens: () => Promise<Kitchen[]>) {
  const router = useRouter();
  const { kitchenId, loaded, load, select } = useKitchenSelection();
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const kitchens = useQuery({ queryKey: ['showcase', 'kitchens'], queryFn: loadKitchens });
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

  return { actions, kitchenId, loaded, selectionError, kitchens, selected, choose,
    goTo: (route: Href) => router.push(route) };
}

import { View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useRiderLocationSetupController } from '@/features/riderLocation/useRiderLocationSetupController';
import { space } from '@/theme';

export default function RiderLocationSetupScreen() {
  const { canEdit, riders, locations, save, selected, setSelected, locationId, setLocationId,
    basis, setBasis, error, choose, submit } = useRiderLocationSetupController();

  if (!canEdit) return <Screen><EmptyState icon="lock-outline" title="Belum punya akses buat setup lokasi" /></Screen>;

  return <Screen refreshing={riders.isRefetching} onRefresh={() => void riders.refetch()}>
    <Text variant="h2">Setup Lokasi Rider</Text>
    <Text variant="body">Isi sekali saat Rider mulai kerja. Ubah kalau pindah titik ya.</Text>
    {error ? <Banner tone="danger" message={error} /> : null}
    {riders.isError || locations.isError ? <EmptyState icon="wifi-off" title="Data belum bisa dibuka" tone="danger"><Button label="Coba lagi" onPress={() => { void riders.refetch(); void locations.refetch(); }} /></EmptyState> : null}
    {selected ? <Card style={{ gap: space.md }}>
      <Text variant="bodyStrong">{selected.name}</Text>
      <Text variant="bodyStrong">Titik jualan</Text>
      <Button label={locationId === null ? 'Tanpa titik jualan' : 'Kosongkan titik'} variant={locationId === null ? 'primary' : 'secondary'} onPress={() => setLocationId(null)} />
      {(locations.data ?? []).map((location) => <Button key={location.id} label={location.name} variant={locationId === location.id ? 'primary' : 'secondary'} onPress={() => setLocationId(location.id)} />)}
      <Text variant="bodyStrong">Absen & Closing</Text>
      <Button label="Di Dapur" variant={basis === 'kitchen' ? 'primary' : 'secondary'} onPress={() => setBasis('kitchen')} />
      <Button label="Di titik jualan" variant={basis === 'selling_location' ? 'primary' : 'secondary'} onPress={() => setBasis('selling_location')} />
      <Button label="Simpan setup" onPress={() => void submit()} loading={save.isPending} disabled={basis === 'selling_location' && locationId === null} />
      <Button label="Batal" variant="secondary" onPress={() => setSelected(null)} />
    </Card> : (riders.data ?? []).map((rider) => <Card key={rider.id} style={{ gap: space.sm }}>
      <Text variant="bodyStrong">{rider.name}</Text>
      <Text variant="body">{rider.setup
        ? `${rider.setup.location?.name ?? 'Tanpa titik jualan'} · ${rider.setup.basis === 'selling_location' ? 'di titik jualan' : 'di Dapur'}`
        : 'Lokasi belum diatur Management'}</Text>
      <Text variant="caption">{rider.setup ? `Diubah ${rider.setup.changed_by?.name ?? 'Backfill'} · ${new Date(rider.setup.created_at).toLocaleDateString('id-ID')}` : 'Belum ada setup'}</Text>
      {rider.history.length > 1 ? <View><Text variant="caption">Riwayat: {rider.history.map((entry) => `${entry.location?.name ?? 'Tanpa titik'} (${entry.basis === 'selling_location' ? 'titik jualan' : 'Dapur'})`).join(' → ')}</Text></View> : null}
      <Button label="Atur setup" variant="secondary" onPress={() => choose(rider)} />
    </Card>)}
  </Screen>;
}

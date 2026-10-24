import { useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '@/features/auth/store';
import { canUse } from '@/features/navigation/menu';
import { useLocations, useRiderSetups, useSaveRiderSetup, type RiderSetupRow } from '@/features/riderLocation/queries';
import { ApiError } from '@/lib/api';

export function useRiderLocationSetupController() {
  const user = useAuth((s) => s.session?.user);
  const riders = useRiderSetups();
  const locations = useLocations();
  const save = useSaveRiderSetup();
  const [selected, setSelected] = useState<RiderSetupRow | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [basis, setBasis] = useState<'kitchen' | 'selling_location'>('kitchen');
  const [error, setError] = useState<string | null>(null);

  const canEdit = !!user && canUse(user, 'rider_location_setup', 'edit');

  const choose = (rider: RiderSetupRow) => {
    setSelected(rider);
    setLocationId(rider.setup?.location_id ?? null);
    setBasis(rider.setup?.basis ?? 'kitchen');
    setError(null);
  };
  const submit = async () => {
    if (!selected) return;
    try {
      await save.mutateAsync({ riderId: selected.id, locationId, basis });
      setSelected(null);
      Alert.alert('Setup tersimpan', `Lokasi ${selected.name} sudah diperbarui ya.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Setup belum tersimpan. Coba lagi ya.');
    }
  };

  return { canEdit, riders, locations, save, selected, setSelected, locationId, setLocationId,
    basis, setBasis, error, choose, submit };
}

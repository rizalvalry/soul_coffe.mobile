import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request, uuidv4 } from '@/lib/api';
import type { Location } from '@/domain/types';

export type RiderSetup = {
  id: number;
  location_id: number | null;
  basis: 'kitchen' | 'selling_location';
  created_at: string;
  superseded_at: string | null;
  location: Location | null;
  changed_by: { id: number; name: string } | null;
};
export type RiderSetupRow = {
  id: number;
  name: string;
  setup: RiderSetup | null;
  history: RiderSetup[];
};

export const riderSetupKeys = { list: ['rider-location-setups'] as const };

export function useRiderSetups() {
  return useQuery({ queryKey: riderSetupKeys.list, queryFn: () => request<RiderSetupRow[]>('/rider-location-setups') });
}

export function useLocations() {
  return useQuery({ queryKey: ['locations'] as const, queryFn: () => request<Location[]>('/locations'), staleTime: 5 * 60_000 });
}

export function useSaveRiderSetup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { riderId: number; locationId: number | null; basis: 'kitchen' | 'selling_location' }) =>
      request<RiderSetup>(`/rider-location-setups/${input.riderId}`, {
        method: 'PATCH', idempotencyKey: uuidv4(), body: { location_id: input.locationId, basis: input.basis },
      }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: riderSetupKeys.list }); },
  });
}

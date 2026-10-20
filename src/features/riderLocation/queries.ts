import { useRef } from 'react';
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
  const pending = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({
    mutationFn: async (input: { riderId: number; locationId: number | null; basis: 'kitchen' | 'selling_location' }) => {
      const signature = JSON.stringify(input);
      if (pending.current?.signature !== signature) pending.current = { signature, key: uuidv4() };
      const attempt = pending.current;
      const result = await request<RiderSetup>(`/rider-location-setups/${input.riderId}`, {
        method: 'PATCH', idempotencyKey: attempt.key, body: { location_id: input.locationId, basis: input.basis },
      });
      if (pending.current === attempt) pending.current = null;
      return result;
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: riderSetupKeys.list }); },
  });
}

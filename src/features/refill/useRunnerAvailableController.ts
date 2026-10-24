import { Alert } from 'react-native';

import { useClaimRefill, useRefills } from '@/features/refill/queries';
import { useRealtimeState } from '@/features/realtime/RealtimeProvider';
import { ApiError } from '@/lib/api';
import type { RefillRequest } from '@/domain/types';

export function useRunnerAvailableController() {
  const refillsQuery = useRefills('READY_TO_PICK');
  const claim = useClaimRefill();
  const realtime = useRealtimeState();

  const onClaim = async (refill: RefillRequest) => {
    try {
      await claim.mutateAsync({ id: refill.id });
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) {
        Alert.alert('Sudah diambil runner lain.');
        void refillsQuery.refetch();
      } else if (e instanceof ApiError) {
        Alert.alert('Gagal mengambil pesanan', e.message);
      }
    }
  };

  const refresh = () => void refillsQuery.refetch();
  const claimDisabled = (refill: RefillRequest) => !refill.can.claim;
  const claimPending = claim.isPending;

  return { refillsQuery, claimPending, realtime, onClaim, refresh, claimDisabled };
}

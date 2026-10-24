import { useMemo } from 'react';
import { Alert } from 'react-native';
import { useRefills, useStartPreparing } from '@/features/refill/queries';
import { useRealtimeState } from '@/features/realtime/RealtimeProvider';
import { ApiError } from '@/lib/api';
import type { RefillRequest, RefillStatus } from '@/domain/types';

type Section = { key: RefillStatus; title: string; data: RefillRequest[] };

const SECTION_ORDER: { key: RefillStatus; title: string }[] = [
  { key: 'SUBMITTED', title: 'Menunggu Approval Finance' },
  { key: 'APPROVED', title: 'Siap Disiapkan' },
  { key: 'PREPARING', title: 'Sedang Disiapkan' },
];

export function useRequestsController() {
  const refillsQuery = useRefills(['SUBMITTED', 'APPROVED', 'PREPARING'], true);
  const startPreparing = useStartPreparing();
  const realtime = useRealtimeState();

  const sections: Section[] = useMemo(() => {
    const data = refillsQuery.data ?? [];
    return SECTION_ORDER.map((s) => ({
      ...s,
      data: data.filter((r) => r.status === s.key),
    })).filter((s) => s.data.length > 0);
  }, [refillsQuery.data]);

  const onStartPreparing = async (refill: RefillRequest) => {
    try {
      await startPreparing.mutateAsync({ id: refill.id });
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) {
        // The server correctly enforcing R1 — the disabled button was convenience, this is the gate.
        Alert.alert('Belum disetujui Finance.');
        void refillsQuery.refetch();
      } else if (e instanceof ApiError) {
        Alert.alert('Gagal memulai penyiapan', e.message);
      }
    }
  };

  return { refillsQuery, startPreparing, realtime, sections, onStartPreparing };
}

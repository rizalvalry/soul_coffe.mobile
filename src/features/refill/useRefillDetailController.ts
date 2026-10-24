import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useCancelRefill, useRefill } from '@/features/refill/queries';
import { useAuth } from '@/features/auth/store';
import { useAttendanceStatus } from '@/features/showcase/queries';
import { DAY_NOT_OPEN_MESSAGE, isDayNotOpen, riderDayGate, riderGateMessage } from '@/features/showcase/riderDayGate';
import { ApiError } from '@/lib/api';

export function useRefillDetailController() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const refillId = Number(id);
  const role = useAuth((s) => s.session?.user.role);

  const refillQuery = useRefill(refillId);
  const attendance = useAttendanceStatus(role === 'STAFF');
  const cancelRefill = useCancelRefill();
  const [actionError, setActionError] = useState<string | null>(null);
  const dayGate = role === 'STAFF' ? riderDayGate(attendance.data) : 'legacy';
  const gateMessage = role === 'STAFF' ? riderGateMessage(dayGate) : null;

  const doCancel = useCallback(async () => {
    setActionError(null);
    if (gateMessage) {
      setActionError(gateMessage);
      return;
    }
    try {
      await cancelRefill.mutateAsync({ id: refillId });
    } catch (e) {
      setActionError(isDayNotOpen(e) ? DAY_NOT_OPEN_MESSAGE : e instanceof ApiError ? e.message : 'Gagal membatalkan permintaan. Coba lagi.');
      if (role === 'STAFF' && isDayNotOpen(e)) void attendance.refetch();
    }
  }, [cancelRefill, refillId, gateMessage, attendance, role]);

  const onCancelPress = useCallback(() => {
    Alert.alert('Batalkan permintaan?', 'Permintaan yang dibatalkan tidak dapat diproses kembali.', [
      { text: 'Tidak', style: 'cancel' },
      { text: 'Batalkan', style: 'destructive', onPress: () => void doCancel() },
    ]);
  }, [doCancel]);

  const refreshRefill = () => void refillQuery.refetch();
  const showAttendanceButton = role === 'STAFF' && dayGate === 'attendance';
  const validRefillId = Number.isFinite(refillId) && refillId > 0;
  // The server's can.cancel flag already includes the owner role and SUBMITTED status checks.
  const canCancel = refillQuery.data?.can.cancel ?? false;
  const cancelDisabled = cancelRefill.isPending || !!gateMessage;

  return {
    router, refillQuery, cancelRefill, actionError, gateMessage, onCancelPress,
    refreshRefill, showAttendanceButton, validRefillId,
    canCancel, cancelDisabled,
  };
}

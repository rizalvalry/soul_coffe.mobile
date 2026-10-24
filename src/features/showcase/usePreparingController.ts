import { useState } from 'react';
import { useMarkReady, useRefills } from '@/features/refill/queries';
import { ApiError } from '@/lib/api';
import type { RefillRequest } from '@/domain/types';

export function usePreparingCardController(refill: RefillRequest) {
  const markReady = useMarkReady();
  const [qty, setQty] = useState<Record<number, number>>(() =>
    Object.fromEntries(refill.lines.map((l) => [l.id, l.qty_approved ?? 0])),
  );
  const [shortfallReason, setShortfallReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hasRetiredLines = refill.lines.some((line) => line.is_operational === false);

  const hasShortfall = refill.lines.some((l) => (qty[l.id] ?? 0) < (l.qty_approved ?? 0));
  const setLineQty = (lineId: number, next: number) =>
    setQty((prev) => ({ ...prev, [lineId]: next }));

  const onSubmit = async () => {
    setError(null);
    if (hasShortfall && shortfallReason.trim().length === 0) {
      setError('Alasan kekurangan wajib diisi karena ada jumlah yang kurang dari yang disetujui.');
      return;
    }
    try {
      await markReady.mutateAsync({
        id: refill.id,
        lines: refill.lines.map((l) => ({ line_id: l.id, qty_prepared: qty[l.id] ?? 0 })),
        ...(hasShortfall ? { shortfallReason: shortfallReason.trim() } : {}),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan tidak terduga.');
    }
  };

  return { markReady, qty, setLineQty, shortfallReason, setShortfallReason, error,
    hasRetiredLines, hasShortfall, onSubmit };
}

export function usePreparingController() {
  const refillsQuery = useRefills('PREPARING', true);
  return { refillsQuery };
}

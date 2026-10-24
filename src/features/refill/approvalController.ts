import { useMemo, useState } from 'react';

import { useApproveRefill, useRefills, useRejectRefill } from '@/features/refill/queries';
import { useRealtimeState } from '@/features/realtime/RealtimeProvider';
import { ApiError } from '@/lib/api';
import type { RefillRequest } from '@/domain/types';

const MIN_REASON_LENGTH = 10;

export function useFinanceApprovalQueue() {
  const refillsQuery = useRefills('SUBMITTED');
  const rows = refillsQuery.data ?? [];
  const realtime = useRealtimeState();
  return { refillsQuery, rows, realtime };
}

export function useFinanceApprovalCard(refill: RefillRequest, onConflict: () => void) {
  const approve = useApproveRefill();
  const reject = useRejectRefill();

  const [qtyApproved, setQtyApproved] = useState<Record<number, number>>(() =>
    Object.fromEntries(refill.lines.map((line) => [line.id, line.qty_requested])),
  );
  const [partialReason, setPartialReason] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPending = approve.isPending || reject.isPending;
  const hasRetiredLines = refill.lines.some((line) => line.is_operational === false);

  const anyReduced = refill.lines.some(
    (line) => (qtyApproved[line.id] ?? line.qty_requested) < line.qty_requested,
  );

  const hasCost = refill.lines.some((line) => typeof line.unit_cost === 'number');
  const grandTotal = useMemo(
    () =>
      refill.lines.reduce((sum, line) => {
        const qty = qtyApproved[line.id] ?? line.qty_requested;
        return sum + qty * (line.unit_cost ?? 0);
      }, 0),
    [refill.lines, qtyApproved],
  );

  const handleConflict = (e: unknown) => {
    if (e instanceof ApiError && e.isConflict) {
      setError('Status permintaan sudah berubah. Muat ulang halaman.');
      onConflict();
      return true;
    }
    return false;
  };

  const onApprove = async () => {
    setError(null);

    if (anyReduced && partialReason.trim().length < MIN_REASON_LENGTH) {
      setError('Alasan pengurangan wajib diisi (min. 10 karakter)');
      return;
    }

    try {
      await approve.mutateAsync({
        id: refill.id,
        lines: refill.lines.map((line) => ({
          line_id: line.id,
          qty_approved: qtyApproved[line.id] ?? line.qty_requested,
        })),
        partialReason: anyReduced ? partialReason.trim() : undefined,
      });
    } catch (e) {
      if (!handleConflict(e)) {
        setError(e instanceof ApiError ? e.message : 'Gagal menyetujui permintaan. Coba lagi.');
      }
    }
  };

  const onReject = async () => {
    setError(null);

    if (rejectReason.trim().length < MIN_REASON_LENGTH) {
      setError('Alasan penolakan wajib diisi (min. 10 karakter)');
      return;
    }

    try {
      await reject.mutateAsync({ id: refill.id, reason: rejectReason.trim() });
    } catch (e) {
      if (!handleConflict(e)) {
        setError(e instanceof ApiError ? e.message : 'Gagal menolak permintaan. Coba lagi.');
      }
    }
  };

  return {
    approve, reject, qtyApproved, setQtyApproved, partialReason, setPartialReason,
    rejectReason, setRejectReason, showRejectInput, setShowRejectInput, error, setError,
    isPending, hasRetiredLines, anyReduced, hasCost, grandTotal, onApprove, onReject,
  };
}

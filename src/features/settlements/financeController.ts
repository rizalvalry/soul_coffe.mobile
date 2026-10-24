import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useApproveSettlement, useRecordSettlement, useSettlementDraft, useSettlementQueue,
  type RecordSettlementInput } from '@/features/settlements/queries';
import { settlementExpectations } from '@/features/settlements/expectations';
import { settlementTarget } from '@/features/settlements/navigation';
import { clearSettlementAttempt, loadOrCreateSettlementAttempt, readSettlementAttempt } from '@/features/settlements/draftAttempt';
import { useAuth } from '@/features/auth/store';
import { ApiError } from '@/lib/api';
import type { SettlementQueueRow } from '@/domain/types';

export function rupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

/** Digits only. A money field that accepts "50.000,00" is a money field that will be typed wrong. */
function toAmount(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/** The API caps each method at Rp 1 trillion; 13 digits also stay inside JS's safe integer range. */
export function moneyDigits(text: string): string {
  return text.replace(/\D/g, '').slice(0, 13);
}

export function useDepositSheetController(row: SettlementQueueRow, date: string | undefined, onClose: () => void) {
  const ownerId = useAuth((s) => s.session?.user.id ?? null);
  const draftQuery = useSettlementDraft(row.cart_id, date);
  const record = useRecordSettlement();
  const approve = useApproveSettlement();

  const [cash, setCash] = useState('');
  const [qris, setQris] = useState('');
  const [transfer, setTransfer] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recordedVariance, setRecordedVariance] = useState<number | null>(null);
  const [recordedMethodVariance, setRecordedMethodVariance] = useState(false);
  const [draftLocked, setDraftLocked] = useState(false);
  const attempt = useRef<Promise<RecordSettlementInput> | null>(null);

  // Set once the money is in; the screen then switches to the cups.
  const [settlementId, setSettlementId] = useState<number | null>(row.settlement_id);
  const [reRecord, setReRecord] = useState(false);
  const [staleCleared, setStaleCleared] = useState(false);
  const [returned, setReturned] = useState<Record<number, number>>({});
  const [rejected, setRejected] = useState<Record<number, number>>({});

  useEffect(() => {
    if (row.settlement_id !== null) {
      setSettlementId(row.settlement_id);
      if (ownerId) void clearSettlementAttempt(ownerId, row.cart_id, date).catch(() => {});
    }
  }, [row.settlement_id, row.cart_id, date, ownerId]);

  useEffect(() => {
    if (!ownerId || row.settlement_id !== null) return;
    let active = true;
    void readSettlementAttempt(ownerId, row.cart_id, date).then((stored) => {
      if (!active || !stored || attempt.current) return;
      attempt.current = Promise.resolve(stored);
      setCash(String(stored.cash));
      setQris(String(stored.qris));
      setTransfer(String(stored.transfer));
      setReason(stored.varianceReason ?? '');
      setDraftLocked(true);
      setError('Setoran tadi belum pasti masuk. Coba lagi pakai data yang sama ya.');
    }).catch(() => {
      if (active) {
        setDraftLocked(true);
        setError('Draft setoran belum bisa dibaca. Batalkan draft buat mulai lagi ya.');
      }
    });
    return () => { active = false; };
  }, [ownerId, row.cart_id, row.settlement_id, date]);

  const draft = draftQuery.data;
  const declared = toAmount(cash) + toAmount(qris) + toAmount(transfer);
  const expectations = settlementExpectations(draft, row);
  const expected = expectations.total;
  const variance = declared - expected;
  const methodVariance = expectations.cash !== null && expectations.qris !== null && expectations.transfer !== null
    && (toAmount(cash) !== expectations.cash || toAmount(qris) !== expectations.qris
      || toAmount(transfer) !== expectations.transfer);
  const flaggedVariance = recordedVariance ?? row.variance_minor ?? 0;

  const remainingLines = useMemo(
    () => (draft?.lines ?? []).filter((line) => line.qty_remaining > 0),
    [draft],
  );

  const submitMoney = useCallback(async () => {
    setError(null);

    try {
      if (!ownerId) throw new Error('Sesi Finance belum siap. Coba masuk lagi ya.');
      // Keep the key and exact body together: the server rejects a reused key with changed data.
      if (!attempt.current) {
        attempt.current = loadOrCreateSettlementAttempt(ownerId, {
          cartId: row.cart_id, date,
          cash: toAmount(cash), qris: toAmount(qris), transfer: toAmount(transfer),
          varianceReason: reason.trim() || undefined,
        });
      }
      let saved: RecordSettlementInput;
      try {
        saved = await attempt.current;
      } catch (e) {
        attempt.current = null;
        throw e;
      }
      setCash(String(saved.cash));
      setQris(String(saved.qris));
      setTransfer(String(saved.transfer));
      setReason(saved.varianceReason ?? '');
      setDraftLocked(true);
      const settlement = await record.mutateAsync(saved);

      await clearSettlementAttempt(ownerId, row.cart_id, date);
      attempt.current = null;
      setDraftLocked(false);
      setSettlementId(settlement.id);
      setReRecord(false);
      setStaleCleared(true);
      setRecordedVariance(settlement.variance);
      setRecordedMethodVariance(!!settlement.method_variance_flagged);
      if (settlement.variance !== 0 || settlement.method_variance_flagged) {
        Alert.alert(
          'Setoran Tercatat',
          settlement.method_variance_flagged
            ? 'Ada selisih per metode. Setoran tetap tercatat dan dilaporkan ke Administrator, Finance, dan Management.'
            : `Selisih ${rupiah(Math.abs(settlement.variance))} tercatat dan dilaporkan ke Administrator & Finance.`,
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Setoran belum bisa dikirim. Coba lagi ya.');
    }
  }, [ownerId, row.cart_id, date, cash, qris, transfer, reason, record]);

  const cancelDraft = useCallback(async () => {
    if (!ownerId) return;
    try {
      await clearSettlementAttempt(ownerId, row.cart_id, date);
      attempt.current = null;
      setDraftLocked(false);
      setError(null);
    } catch {
      setError('Draft belum bisa dibatalkan. Coba lagi ya.');
    }
  }, [ownerId, row.cart_id, date]);

  const reopenMoney = useCallback(async () => {
    setError(null);
    try {
      const fresh = await draftQuery.refetch();
      if (!fresh.isSuccess || !fresh.data) {
        setError('Angka Closing terbaru belum bisa dibuka. Coba lagi ya.');
        return;
      }
      setCash(String(row.cash_minor ?? toAmount(cash)));
      setQris(String(row.qris_minor ?? toAmount(qris)));
      setTransfer(String(row.transfer_minor ?? toAmount(transfer)));
      setReason('');
      setReRecord(true);
    } catch {
      setError('Angka Closing terbaru belum bisa dibuka. Coba lagi ya.');
    }
  }, [draftQuery, row.cash_minor, row.qris_minor, row.transfer_minor, cash, qris, transfer]);

  const submitCups = useCallback(async () => {
    setError(null);

    if (!settlementId) return;

    try {
      await approve.mutateAsync({
        settlementId,
        lines: (draft?.lines ?? []).map((line) => ({
          product_id: line.product_id,
          qty_returned: returned[line.product_id] ?? 0,
          qty_rejected: rejected[line.product_id] ?? 0,
        })),
      });

      Alert.alert('Setoran Selesai', `Coffee Bike ${row.cart_code ?? ''} sudah direkonsiliasi.`);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan tidak terduga.');
    }
  }, [settlementId, draft, returned, rejected, approve, onClose, row.cart_code]);

  return {
    draftQuery, record, approve, cash, setCash, qris, setQris, transfer, setTransfer,
    reason, setReason, error, recordedVariance, recordedMethodVariance, draftLocked,
    settlementId, reRecord, staleCleared, returned, setReturned, rejected, setRejected,
    draft, declared, expectations, expected, variance, methodVariance, flaggedVariance,
    remainingLines, submitMoney, cancelDraft, reopenMoney, submitCups,
  };
}

export function useFinanceSettlementQueue() {
  const params = useLocalSearchParams<{ date?: string; cart_id?: string }>();
  const { date, cartId } = settlementTarget(params);
  const queueQuery = useSettlementQueue(date);
  const [openCartId, setOpenCartId] = useState<number | null>(cartId);

  useEffect(() => setOpenCartId(cartId), [cartId, date]);

  const rows = queueQuery.data ?? [];
  const open = rows.find((row) => row.cart_id === openCartId && (row.closing_required === false || row.closing_id !== null)) ?? null;
  const waiting = rows.filter((row) => row.settlement_id === null).length;

  return { date, queueQuery, setOpenCartId, rows, open, waiting };
}

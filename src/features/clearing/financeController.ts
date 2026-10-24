import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/features/auth/store';
import { clearClearingAttempt, loadOrCreateClearingAttempt, readClearingAttempt } from '@/features/clearing/attempt';
import { useClearingOptions, useClearingReceipts, useMatchClearing, useRecordClearing,
  useVoidClearing, type ClearingInput } from '@/features/clearing/queries';
import { ApiError, uuidv4 } from '@/lib/api';

function todayLocal(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function digits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 13);
}

export function useFinanceClearingController() {
  const ownerId = String(useAuth((state) => state.session?.user.id ?? ''));
  const options = useClearingOptions();
  const receipts = useClearingReceipts();
  const record = useRecordClearing();
  const voidReceipt = useVoidClearing();
  const matchReceipt = useMatchClearing();
  const attempt = useRef<Promise<ClearingInput> | null>(null);
  const recordInFlight = useRef(false);
  const voidKey = useRef<{ id: number; reason: string; key: string } | null>(null);
  const matchKey = useRef<{ id: number; sale_dates: string[]; uuid: string } | null>(null);

  const [date, setDate] = useState(todayLocal());
  const [amount, setAmount] = useState('');
  const [mdr, setMdr] = useState('0');
  const [dates, setDates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [voidId, setVoidId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [matchId, setMatchId] = useState<number | null>(null);
  const [matchDates, setMatchDates] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [canCancelDraft, setCanCancelDraft] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    void readClearingAttempt(ownerId).then((saved) => {
      if (!active || !saved) return;
      attempt.current = Promise.resolve(saved);
      setDate(saved.received_on);
      setAmount(String(saved.amount_minor));
      setMdr(String(saved.mdr_minor));
      setDates(saved.sale_dates);
      setLocked(true);
      setCanCancelDraft(false);
      setError('Dana tadi belum pasti masuk. Coba kirim lagi pakai data yang sama ya.');
    }).catch(() => {
      if (active) setError('Draft dana masuk belum bisa dibaca. Coba lagi ya.');
    });
    return () => { active = false; };
  }, [ownerId]);

  const submit = async () => {
    setError(null);
    if (!ownerId || !options.data?.bank_account_id) {
      setError('Rekening Bank belum siap. Muat ulang layar ini ya.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(amount || '0') < 1) {
      setError('Isi tanggal YYYY-MM-DD dan nominal dana masuk lebih dari 0 ya.');
      return;
    }
    if (recordInFlight.current) return;
    recordInFlight.current = true;
    try {
      if (!attempt.current) {
        attempt.current = loadOrCreateClearingAttempt(ownerId, {
          received_on: date, amount_minor: Number(amount), mdr_minor: Number(mdr || '0'),
          bank_account_id: options.data.bank_account_id, sale_dates: [...dates].sort(),
        });
      }
      const saved = await attempt.current;
      setLocked(true);
      setCanCancelDraft(false);
      await record.mutateAsync(saved);
      await clearClearingAttempt(ownerId);
      attempt.current = null;
      setLocked(false);
      setCanCancelDraft(false);
      setAmount('');
      setMdr('0');
      setDates([]);
      Alert.alert('Dana masuk tercatat', 'Dana bank, MDR, dan kliring sudah masuk jurnal.');
    } catch (cause) {
      // A validation response means the server rejected the write. A timeout or
      // server error may mean it committed, so only the original key can be retried.
      setCanCancelDraft(cause instanceof ApiError && cause.isValidation);
      setError(cause instanceof ApiError ? cause.message : 'Dana belum bisa dikirim. Coba lagi ya.');
    } finally {
      recordInFlight.current = false;
    }
  };

  const cancelDraft = async () => {
    if (!canCancelDraft || recordInFlight.current || record.isPending) return;
    recordInFlight.current = true;
    try {
      await clearClearingAttempt(ownerId);
      attempt.current = null;
      setLocked(false);
      setCanCancelDraft(false);
      setError(null);
    } catch {
      setError('Draft belum bisa dibatalkan. Coba lagi ya.');
    } finally {
      recordInFlight.current = false;
    }
  };

  const confirmVoid = async () => {
    if (voidId === null || !voidReason.trim()) {
      setError('Isi alasan pembatalan dulu ya.');
      return;
    }
    try {
      if (!voidKey.current || voidKey.current.id !== voidId || voidKey.current.reason !== voidReason.trim()) {
        voidKey.current = { id: voidId, reason: voidReason.trim(), key: uuidv4() };
      }
      await voidReceipt.mutateAsync(voidKey.current);
      voidKey.current = null;
      setVoidId(null);
      setVoidReason('');
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Pembatalan belum berhasil. Coba lagi ya.');
    }
  };

  const toggleDate = (saleDate: string) => {
    if (locked) return;
    setDates((current) => current.includes(saleDate)
      ? current.filter((item) => item !== saleDate)
      : [...current, saleDate]);
  };

  const submitMatch = async () => {
    if (matchId === null || matchDates.length === 0) {
      setError('Pilih minimal satu hari penjualan ya.');
      return;
    }
    try {
      const selected = [...matchDates].sort();
      if (!matchKey.current || matchKey.current.id !== matchId
        || JSON.stringify(matchKey.current.sale_dates) !== JSON.stringify(selected)) {
        matchKey.current = { id: matchId, sale_dates: selected, uuid: uuidv4() };
      }
      await matchReceipt.mutateAsync(matchKey.current);
      matchKey.current = null;
      setMatchId(null);
      setMatchDates([]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Hari penjualan belum bisa dipasangkan. Coba lagi ya.');
    }
  };

  const aging = options.data?.aging;

  return {
    options, receipts, record, voidReceipt, matchReceipt, date, setDate,
    amount, setAmount, mdr, setMdr, dates, error, voidId, setVoidId,
    voidReason, setVoidReason, matchId, setMatchId, matchDates, setMatchDates,
    locked, canCancelDraft, submit, cancelDraft, confirmVoid, toggleDate, submitMatch, aging,
  };
}

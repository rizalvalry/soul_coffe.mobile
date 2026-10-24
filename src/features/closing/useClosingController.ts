import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useProducts } from '@/features/refill/queries';
import { useClosingDraft, useRecordClosing } from '@/features/closing/queries';
import { closingTotals } from '@/features/closing/calculation';
import { closingSubmissionGate } from '@/features/closing/submissionGate';
import { commissionSummary } from '@/features/closing/commission';
import { closingLocationMessage } from '@/features/closing/locationCheck';
import { closingFormSignature } from '@/features/closing/formState';
import { useOfflineSalesQueue } from '@/features/sales/useOfflineSalesQueue';
import { ApiError, uuidv4 } from '@/lib/api';

function amount(text: string): number {
  return /^\d+$/.test(text) ? Number(text) : text === '' ? 0 : -1;
}
function rupiah(value: number): string {
  return 'Rp ' + value.toLocaleString('id-ID');
}
async function closingGps(): Promise<{ lat: number; lng: number } | null> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) return null;
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.LocationAccuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    return fix ? { lat: fix.coords.latitude, lng: fix.coords.longitude } : null;
  } catch {
    return null;
  }
}

export function useClosingController() {
  const router = useRouter();
  const draft = useClosingDraft();
  const products = useProducts();
  const record = useRecordClosing();
  const oldSales = useOfflineSalesQueue();
  const [remaining, setRemaining] = useState<Record<number, string>>({});
  const [wasted, setWasted] = useState<Record<number, string>>({});
  const [qris, setQris] = useState('0');
  const [transfer, setTransfer] = useState('0');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsFreshDraft, setNeedsFreshDraft] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const retry = useRef<{ key: string; signature: string; gps: { lat: number; lng: number } | null } | null>(null);
  const hydratedForm = useRef<string | null>(null);
  const formSignature = draft.data ? closingFormSignature(draft.data) : null;

  useEffect(() => {
    if (!draft.data || formSignature === hydratedForm.current) return;
    hydratedForm.current = formSignature;
    setRemaining(Object.fromEntries(draft.data.lines.map((line) => [
      line.product_id, String(draft.data?.closing_id ? line.qty_remaining : line.qty_in + line.qty_carry - line.qty_office_sold),
    ])));
    setWasted(Object.fromEntries(draft.data.lines.map((line) => [line.product_id, String(line.qty_wasted)])));
    setQris(String(draft.data.qris_minor));
    setTransfer(String(draft.data.transfer_minor));
    setNote(draft.data.note ?? '');
  }, [draft.data, formSignature]);

  const counts = useMemo(
    () => Object.fromEntries(Object.entries(remaining).map(([id, value]) => [Number(id), amount(value)])),
    [remaining],
  );
  const wasteCounts = useMemo(
    () => Object.fromEntries(Object.entries(wasted).map(([id, value]) => [Number(id), amount(value)])),
    [wasted],
  );
  const totals = closingTotals(draft.data?.lines ?? [], counts, wasteCounts, amount(qris), amount(transfer));
  const productById = new Map((products.data ?? []).map((product) => [product.id, product]));

  const submit = async () => {
    if (!draft.data || !draft.data.can_correct || (!needsFreshDraft && !totals.valid)) return;
    try {
      if (needsFreshDraft) {
        const refresh = await closingSubmissionGate({ ready: true, hadPending: true }, () => draft.refetch());
        if (refresh === 'review') {
          setNeedsFreshDraft(false);
          setError('Angka Closing sudah diperbarui. Cek lagi sebelum kirim ya.');
        } else {
          setError('Angka Closing terbaru belum bisa dibuka. Coba lagi ya.');
        }
        return;
      }
      const sync = await oldSales.syncBeforeClosing();
      const gate = await closingSubmissionGate(sync, () => draft.refetch());
      if (gate === 'pending') {
        setError('Antrean penjualan lama masih menunggu dikirim. Sambungkan internet, lalu coba lagi ya.');
        return;
      }
      if (gate === 'refresh_failed') {
        setNeedsFreshDraft(true);
        setError('Antrean lama sudah terkirim, tapi angka Closing terbaru belum bisa dibuka. Coba lagi ya.');
        return;
      }
      if (gate === 'review') {
        setError('Antrean lama sudah terkirim. Cek lagi angka Closing yang baru, lalu kirim ya.');
        return;
      }
    } catch {
      setError('Antrean lama belum bisa dicek. Coba lagi ya.');
      return;
    }
    const latest = await draft.refetch();
    if (!latest.isSuccess || !latest.data) {
      setError('Titik Closing terbaru belum bisa dicek. Coba lagi ya.');
      return;
    }
    if (latest.data.cart_id !== draft.data.cart_id ||
      JSON.stringify(latest.data.closing_point) !== JSON.stringify(draft.data.closing_point) ||
      closingFormSignature(latest.data) !== formSignature) {
      setError('Data Closing berubah. Cek lagi angka dan titiknya sebelum kirim ya.');
      return;
    }
    const lines = draft.data.lines.map((line) => ({
      product_id: line.product_id,
      qty_remaining: counts[line.product_id] ?? 0,
      qty_wasted: wasteCounts[line.product_id] ?? 0,
    }));
    const signature = JSON.stringify([draft.data.cart_id, lines, amount(qris), amount(transfer), note.trim()]);
    const attempt = retry.current?.signature === signature
      ? retry.current
      : { key: uuidv4(), signature, gps: await closingGps() };
    const locationMessage = closingLocationMessage(draft.data.closing_point, attempt.gps);
    Alert.alert(
      draft.data.closing_id ? 'Koreksi Closing?' : 'Kirim Closing?',
      String(totals.cupsSold) + ' cups terjual. Tunai yang harus disetor ' + rupiah(totals.cash) + '.\n' + locationMessage,
      [
        { text: 'Cek lagi', style: 'cancel' },
        { text: 'Kirim', onPress: async () => {
          setError(null);
          retry.current = attempt;
          try {
            const saved = await record.mutateAsync({
              key: attempt.key, lines, qris: amount(qris), transfer: amount(transfer), gps: attempt.gps, note: note.trim(),
            });
            retry.current = null;
            router.replace({ pathname: '/staff/settlement', params: { operating_date: saved.operating_date } });
          } catch (e) {
            if (e instanceof ApiError && !e.isOffline) retry.current = null;
            setError(e instanceof ApiError ? e.message : 'Closing belum terkirim. Coba lagi ya.');
          }
        } },
      ],
    );
  };

  return { draft, record, oldSales, remaining, setRemaining, wasted, setWasted, qris, setQris,
    transfer, setTransfer, note, setNote, error, needsFreshDraft, showCorrection,
    setShowCorrection, totals, productById, submit, rupiah, commissionSummary };
}

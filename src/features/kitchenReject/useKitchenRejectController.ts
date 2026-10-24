import { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/store';
import { useProducts } from '@/features/refill/queries';
import { useKitchenSelection } from '@/features/showcase/kitchenSelection';
import { kitchenOperationKey } from '@/features/showcase/operationKey';
import { validateKitchenReject, type RejectLine, type RejectReason } from '@/features/kitchenReject/validation';
import { request, uploadFile } from '@/lib/api';
import { compressForUpload } from '@/lib/image';

type Kitchen = { id: number; name: string };
type Stock = { product_id: number; product_name: string; qty: number };
type Reject = { id: number; status: string; reason_code: RejectReason; created_at: string;
  lines: { product_id: number; product_name: string; qty: number }[] };
type Photo = { uri: string; takenAt: string };

export function useKitchenRejectController() {
  const router = useRouter();
  const client = useQueryClient();
  const user = useAuth((s) => s.session?.user);
  const isProduction = user?.role === 'BARISTA';
  const { kitchenId, loaded, load, select } = useKitchenSelection();
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setQty({}); setReason(null); setNote(''); setPhoto(null); setError(null);
  }, [kitchenId]);

  useEffect(() => { if (!isProduction) void load(); }, [isProduction, load]);
  const kitchens = useQuery({ queryKey: ['kitchen-rejects', 'kitchens'],
    queryFn: () => request<Kitchen[]>('/kitchen-rejects/kitchens'), enabled: !isProduction });
  useEffect(() => {
    if (isProduction || !loaded || !kitchens.data) return;
    if (kitchens.data.length === 1 && kitchenId !== kitchens.data[0]?.id) void select(kitchens.data[0]!.id);
    else if (kitchenId !== null && !kitchens.data.some((kitchen) => kitchen.id === kitchenId)) void select(null);
  }, [isProduction, loaded, kitchens.data, kitchenId, select]);
  const ready = isProduction || (loaded && !!kitchenId);
  const stock = useQuery({ queryKey: ['kitchen-rejects', 'stock', isProduction ? user?.kitchenId : kitchenId],
    queryFn: () => request<Stock[]>('/kitchen-rejects/stock', { kitchen: true }), enabled: ready });
  const history = useQuery({ queryKey: ['kitchen-rejects', 'history', isProduction ? user?.kitchenId : kitchenId],
    queryFn: () => request<Reject[]>('/kitchen-rejects', { kitchen: true }), enabled: ready });
  const products = useProducts();
  const stockMap = useMemo(() => Object.fromEntries((stock.data ?? []).map((row) => [row.product_id, row.qty])), [stock.data]);
  const choices = (products.data ?? []).filter((product) => product.is_sellable && stockMap[product.id] !== undefined);
  const lines: RejectLine[] = Object.entries(qty).filter(([, value]) => value > 0)
    .map(([id, value]) => ({ product_id: Number(id), qty: value }));

  const takePhoto = async () => {
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { setError('Aktifkan izin kamera dulu ya.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: false });
      if (!result.canceled && result.assets?.[0]) setPhoto({ uri: result.assets[0].uri, takenAt: new Date().toISOString() });
    } catch { setError('Kamera belum bisa dibuka. Coba lagi ya.'); }
  };

  const submit = async () => {
    setError(null);
    setSuccess(null);
    const problem = validateKitchenReject(lines, stockMap, reason, note, photo?.uri ?? null);
    if (problem) { setError(problem); return; }
    if (!photo || !reason) return;
    setSending(true);
    try {
      const image = await compressForUpload(photo.uri);
      const fields: Record<string, string> = { lines: JSON.stringify(lines), reason_code: reason,
        note: note.trim(), photo_taken_at: photo.takenAt };
      if (!isProduction && kitchenId) fields['kitchen_id'] = String(kitchenId);
      const operation = await kitchenOperationKey('/kitchen-rejects', { ...fields, photo_uri: photo.uri });
      const created = await uploadFile<Reject>('/kitchen-rejects',
        { uri: image.uri, name: 'reject.jpg', type: 'image/jpeg' }, fields, 'photo', operation.key);
      await operation.clear();
      setQty({}); setReason(null); setNote(''); setPhoto(null);
      setSuccess(created.status === 'NEEDS_REVIEW'
        ? 'Reject tercatat dan perlu ditinjau Finance.' : 'Reject tercatat. Stok showcase sudah diperbarui.');
      await Promise.all([client.invalidateQueries({ queryKey: ['kitchen-rejects'] }),
        client.invalidateQueries({ queryKey: ['showcase', 'stock'] })]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reject belum terkirim. Coba lagi ya.');
    } finally { setSending(false); }
  };

  return { router, isProduction, select, qty, setQty, reason, setReason, note, setNote,
    photo, error, success, sending, kitchens, ready, stock, history, products, stockMap, choices,
    takePhoto, submit };
}

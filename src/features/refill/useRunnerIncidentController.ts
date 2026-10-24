import { useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { useReportIncident } from '@/features/incidents/queries';
import { capturePhoto, type Photo } from '@/features/refill/useRunnerEvidence';
import { ApiError } from '@/lib/api';
import type { RefillRequest } from '@/domain/types';

export function useRunnerIncidentController(refill: RefillRequest, onClose: () => void) {
  const report = useReportIncident();

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [damaged, setDamaged] = useState<Record<number, number>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const totalDamaged = useMemo(() => Object.values(damaged).reduce((sum, n) => sum + n, 0), [damaged]);
  const allDamaged = useMemo(
    () => refill.lines.every((line) => (damaged[line.id] ?? 0) >= (line.qty_prepared ?? 0)),
    [refill.lines, damaged],
  );
  const isSubmitting = report.isPending;
  const submitDisabled = isSubmitting || !photo || totalDamaged <= 0;
  const changeDamaged = (lineId: number, next: number) => setDamaged((prev) => ({ ...prev, [lineId]: next }));
  const maxDamaged = (line: RefillRequest['lines'][number]) => line.qty_prepared ?? 0;

  const takePhoto = async () => {
    setError(null);
    try {
      const taken = await capturePhoto();
      if (taken) setPhoto(taken);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tidak dapat membuka kamera.');
    }
  };

  const onSubmit = async () => {
    setError(null);

    if (!photo) {
      setError('Foto kerusakan wajib diambil dulu.');
      return;
    }
    if (totalDamaged <= 0) {
      setError('Isi dulu jumlah cups yang rusak.');
      return;
    }

    try {
      await report.mutateAsync({
        refillId: refill.id,
        photoUri: photo.uri,
        takenAt: photo.takenAt,
        lines: Object.entries(damaged)
          .map(([lineId, qty]) => ({ line_id: Number(lineId), qty_damaged: qty }))
          .filter((line) => line.qty_damaged > 0),
        note: note.trim() || undefined,
      });

      Alert.alert(
        'Laporan Terkirim',
        'Finance dan Administrator sudah diberi tahu. Tunggu keputusan mereka: pengantaran dibatalkan, atau lanjut dengan cups yang masih layak.',
      );
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan tidak terduga.');
    }
  };

  return {
    photo, damaged, note, error, totalDamaged, allDamaged,
    isSubmitting, submitDisabled, changeDamaged, maxDamaged, setNote, takePhoto, onSubmit,
  };
}

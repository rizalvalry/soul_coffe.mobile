import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useDeliverRefill, useUploadHandoverPhoto } from '@/features/refill/queries';
import { captureGps, capturePhoto, withTimeout, type GpsCoords, type Photo } from '@/features/refill/useRunnerEvidence';
import { ApiError } from '@/lib/api';
import type { RefillRequest } from '@/domain/types';
import type { SignatureResult } from '@/components/ui/SignaturePad';

export type ProofMode = 'none' | 'staff_signature' | 'pin_fallback';

export function useRunnerDeliveryController(refill: RefillRequest, onClose: () => void) {
  const uploadPhoto = useUploadHandoverPhoto();
  const deliver = useDeliverRefill();
  const uploadedPhoto = useRef<{ uri: string; takenAt: string; id: number } | null>(null);
  const delivering = useRef(false);

  const [qty, setQty] = useState<Record<number, number>>(() =>
    Object.fromEntries(refill.lines.map((l) => [l.id, l.qty_prepared ?? 0])),
  );
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [proof, setProof] = useState<ProofMode>('none');
  const [signature, setSignature] = useState<SignatureResult | null>(null);
  const [staffPin, setStaffPin] = useState('');
  const [gps, setGps] = useState<GpsCoords | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'loading' | 'ok' | 'unavailable'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void withTimeout(captureGps(), 8000, null).then((coords) => {
      if (cancelled) return;
      setGps(coords);
      setGpsStatus(coords ? 'ok' : 'unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isSubmitting = uploadPhoto.isPending || deliver.isPending;
  // A photo is required. Signature and PIN are optional, but must be complete if chosen.
  const canSubmit =
    photo !== null &&
    (proof === 'none' ||
      (proof === 'staff_signature' && signature !== null) ||
      (proof === 'pin_fallback' && staffPin.length === 6));
  const submitDisabled = !canSubmit || isSubmitting;
  const isUploading = uploadPhoto.isPending;

  const changeQty = (lineId: number, next: number) => setQty((prev) => ({ ...prev, [lineId]: next }));
  const maxReceived = (line: RefillRequest['lines'][number]) => line.qty_prepared ?? 0;
  const selectProof = (mode: ProofMode) => {
    setProof(mode);
    setSignature(null);
    setStaffPin('');
    setError(null);
  };
  const clearSignature = () => setSignature(null);
  const changeStaffPin = (value: string) => setStaffPin(value.replace(/\D/g, '').slice(0, 6));

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
    if (delivering.current) return;
    setError(null);

    if (!photo) {
      setError('Foto serah terima wajib diambil dulu.');
      return;
    }

    delivering.current = true;
    try {
      // Upload first, then reference the media id in the delivery request.
      let media = uploadedPhoto.current;
      if (!media || media.uri !== photo.uri || media.takenAt !== photo.takenAt) {
        const uploaded = await uploadPhoto.mutateAsync({ uri: photo.uri, takenAt: photo.takenAt });
        media = { uri: photo.uri, takenAt: photo.takenAt, id: uploaded.id };
        uploadedPhoto.current = media;
      }

      const result = await deliver.mutateAsync({
        id: refill.id,
        handoverMediaId: media.id,
        lines: refill.lines.map((l) => ({ line_id: l.id, qty_received: qty[l.id] ?? 0 })),
        gps,
        ...(proof === 'staff_signature' && signature
          ? { signature: { method: 'staff_signature' as const, uri: signature.uri, strokeCount: signature.strokeCount } }
          : {}),
        ...(proof === 'pin_fallback' ? { signature: { method: 'pin_fallback' as const, staffPin } } : {}),
      });

      // 202 means delivery is recorded while stock ledger posting is retried (E19).
      const isRetryPosting = result.ledgerPending;
      Alert.alert(
        isRetryPosting ? 'Pengiriman Tercatat' : 'Pengiriman Selesai',
        isRetryPosting
          ? 'Pengiriman tercatat, posting stok sedang diproses ulang.'
          : `${refill.code} telah diterima ${refill.staff_name}.`,
      );
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan tidak terduga.');
    } finally {
      delivering.current = false;
    }
  };

  return {
    qty, photo, proof, staffPin, gpsStatus, error,
    isSubmitting, submitDisabled, isUploading, changeQty, maxReceived, selectProof, setSignature,
    clearSignature, changeStaffPin, takePhoto, onSubmit,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

import { useAuth } from '@/features/auth/store';
import { useProducts, useSubmitRefill, useUploadEvidence } from '@/features/refill/queries';
import { useAttendanceStatus } from '@/features/showcase/queries';
import { DAY_NOT_OPEN_MESSAGE, NO_CART_TODAY_MESSAGE, isDayNotOpen, isNoCartToday, riderDayGate, riderGateMessage } from '@/features/showcase/riderDayGate';
import { ApiError } from '@/lib/api';

/** Hard ceiling per line — R7/§9: "Jumlah harus antara 1 dan 100 cups". */
const MAX_PER_LINE = 100;

type Photo = { uri: string; takenAt: string };
type GpsCoords = { lat: number; lng: number };
type GpsStatus = 'checking' | 'granted' | 'unavailable';

/** Keep form attempts, evidence reuse, and location evidence together across renders. */
export function useNewRefillController() {
  const router = useRouter();
  const user = useAuth((s) => s.session?.user);
  const refreshUser = useAuth((s) => s.refreshUser);
  const cartRefreshStatus = useAuth((s) => s.cartRefreshStatus);
  const cartRefreshError = useAuth((s) => s.cartRefreshError);

  useFocusEffect(useCallback(() => {
    void refreshUser().catch(() => {});
  }, [refreshUser]));

  const productsQuery = useProducts();
  const attendance = useAttendanceStatus(user?.role === 'STAFF');
  const uploadEvidence = useUploadEvidence();
  const submitRefill = useSubmitRefill();
  const uploadedEvidence = useRef<{ uri: string; takenAt: string; id: number } | null>(null);
  const submitting = useRef(false);

  const [qty, setQty] = useState<Record<number, number>>({});
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsCoords | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('checking');
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // GPS is best-effort — a denial or an unavailable service must never block submit (E10).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          if (!cancelled) setGpsStatus('unavailable');
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.LocationAccuracy.Balanced,
        });
        if (cancelled) return;

        setGps({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGpsStatus('granted');

        // The address is for the human reading this screen; the request itself carries the raw
        // coordinates either way (submitted below via `gps`), so this runs after the coordinates
        // are already committed above, and its failure is silent — a rider must never be
        // blocked from filing a request because the device's geocoder was slow or offline.
        try {
          const [place] = await Location.reverseGeocodeAsync({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });

          if (cancelled || !place) return;

          // Street then district then city, which is how a field address is actually read out
          // loud here. Falsy and duplicate parts are dropped so a village that repeats its city
          // does not read "Cilandak, Cilandak".
          const parts = [place.street, place.district ?? place.subregion, place.city ?? place.region]
            .filter((part): part is string => Boolean(part))
            .filter((part, index, all) => all.indexOf(part) === index);

          if (parts.length > 0) setPlaceName(parts.join(', '));
        } catch {
          // Leave placeName null; the header falls back to the plain "Lokasi terdeteksi".
        }
      } catch {
        if (!cancelled) setGpsStatus('unavailable');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalCups = useMemo(() => Object.values(qty).reduce((sum, n) => sum + n, 0), [qty]);
  const selectedCount = useMemo(() => Object.values(qty).filter((n) => n > 0).length, [qty]);
  const isSubmitting = uploadEvidence.isPending || submitRefill.isPending;
  const dayGate = user?.role === 'STAFF' ? riderDayGate(attendance.data) : 'legacy';
  const gateMessage = riderGateMessage(dayGate);

  const capturePhoto = useCallback(async () => {
    setCameraError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setCameraError('Izin kamera ditolak. Aktifkan izin kamera di pengaturan HP untuk melanjutkan.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.[0]) return;
      setPhoto({ uri: result.assets[0].uri, takenAt: new Date().toISOString() });
    } catch {
      setCameraError('Tidak dapat membuka kamera. Coba lagi.');
    }
  }, []);

  const onSubmit = useCallback(async () => {
    if (submitting.current) return;
    setFormError(null);

    if (gateMessage) {
      setFormError(gateMessage);
      return;
    }

    if (!user?.cartId) {
      setFormError(NO_CART_TODAY_MESSAGE);
      return;
    }
    if (totalCups <= 0) {
      setFormError('Pilih minimal satu produk');
      return;
    }
    if (!photo) {
      setFormError('Foto bukti wajib diambil langsung dari kamera');
      return;
    }

    const cartId = user.cartId;
    submitting.current = true;

    try {
      // The first upload may have succeeded even when /refills times out. Reuse its media id so
      // the retry reaches the saved submit attempt instead of trying to upload spent evidence.
      let evidence = uploadedEvidence.current;
      if (!evidence || evidence.uri !== photo.uri || evidence.takenAt !== photo.takenAt) {
        const media = await uploadEvidence.mutateAsync({ uri: photo.uri, takenAt: photo.takenAt });
        evidence = { uri: photo.uri, takenAt: photo.takenAt, id: media.id };
        uploadedEvidence.current = evidence;
      }

      const lines = Object.entries(qty)
        .map(([productId, requested]) => ({ product_id: Number(productId), qty_requested: requested }))
        .filter((line) => line.qty_requested > 0);

      const created = await submitRefill.mutateAsync({
        cartId,
        evidenceMediaId: evidence.id,
        gps,
        lines,
        note: note.trim(),
      });

      router.replace(`/staff/requests/${created.id}`);
    } catch (e) {
      if (e instanceof ApiError) {
        if (isDayNotOpen(e)) {
          setFormError(DAY_NOT_OPEN_MESSAGE);
          void attendance.refetch();
        } else if (e.isConflict) {
          setFormError('Masih ada request yang belum selesai untuk Coffee Bike ini.');
        } else if (e.isForbidden) {
          setFormError(e.message);
          if (isNoCartToday(e)) void refreshUser().catch(() => {});
        } else {
          setFormError(e.message);
        }
      } else {
        setFormError('Terjadi kesalahan tidak terduga. Coba lagi.');
      }
    } finally {
      submitting.current = false;
    }
  }, [user, totalCups, photo, qty, gps, note, uploadEvidence, submitRefill, router, gateMessage, attendance, refreshUser]);

  const changeQty = (productId: number, next: number) => setQty((prev) => ({ ...prev, [productId]: next }));
  const retryCartRefresh = () => void refreshUser().catch(() => {});
  const refreshProducts = () => void productsQuery.refetch();
  const refreshProps = isSubmitting ? {} : { onRefresh: refreshProducts };
  const controlsDisabled = isSubmitting || !!gateMessage;

  return {
    router, user, cartRefreshStatus, cartRefreshError, productsQuery, uploadEvidence,
    qty, changeQty, photo, cameraError, gpsStatus, placeName, formError, note, setNote,
    totalCups, selectedCount, isSubmitting, dayGate, gateMessage, capturePhoto, onSubmit,
    maxPerLine: MAX_PER_LINE, controlsDisabled, refreshProps, retryCartRefresh, refreshProducts,
  };
}

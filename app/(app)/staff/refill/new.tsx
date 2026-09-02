import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/store';
import { useProducts, useSubmitRefill, useUploadEvidence } from '@/features/refill/queries';
import { ApiError } from '@/lib/api';
import { brand, feedback, neutral, radius, semantic, space } from '@/theme';

/** Hard ceiling per line — R7/§9: "Jumlah harus antara 1 dan 100 cups". */
const MAX_PER_LINE = 100;

type Photo = { uri: string; takenAt: string };
type GpsCoords = { lat: number; lng: number };
type GpsStatus = 'checking' | 'granted' | 'unavailable';

/**
 * The most important screen in the app (requirement 2).
 *
 * Two invariants this screen exists to protect:
 *  - The total is *computed*, never typed — the paper form's manual addition is exactly where
 *    errors came from (§4).
 *  - Evidence is uploaded and linked *before* the request is created (E4), via camera capture
 *    only (R3/E6) — `launchImageLibraryAsync` must never appear here.
 */
export default function NewRefillScreen() {
  const router = useRouter();
  const user = useAuth((s) => s.session?.user);

  const productsQuery = useProducts();
  const uploadEvidence = useUploadEvidence();
  const submitRefill = useSubmitRefill();

  const [qty, setQty] = useState<Record<number, number>>({});
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsCoords | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('checking');
  const [formError, setFormError] = useState<string | null>(null);

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
        if (!cancelled) {
          setGps({ lat: position.coords.latitude, lng: position.coords.longitude });
          setGpsStatus('granted');
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
  const isSubmitting = uploadEvidence.isPending || submitRefill.isPending;

  const capturePhoto = useCallback(async () => {
    setCameraError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setCameraError(
          'Izin kamera ditolak. Aktifkan izin kamera di pengaturan HP untuk melanjutkan.',
        );
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
    setFormError(null);

    if (!user?.cartId) {
      setFormError('Anda tidak bertugas di gerobak ini hari ini.');
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

    try {
      const evidence = await uploadEvidence.mutateAsync({ uri: photo.uri, takenAt: photo.takenAt });

      const lines = Object.entries(qty)
        .map(([productId, requested]) => ({ product_id: Number(productId), qty_requested: requested }))
        .filter((line) => line.qty_requested > 0);

      const created = await submitRefill.mutateAsync({
        cartId,
        evidenceMediaId: evidence.id,
        gps,
        lines,
      });

      router.replace(`/staff/requests/${created.id}`);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.isConflict) {
          setFormError('Masih ada request yang belum selesai untuk gerobak ini.');
        } else if (e.isForbidden) {
          setFormError('Anda tidak bertugas di gerobak ini hari ini.');
        } else {
          setFormError(e.message);
        }
      } else {
        setFormError('Terjadi kesalahan tidak terduga. Coba lagi.');
      }
    }
  }, [user, totalCups, photo, qty, gps, uploadEvidence, submitRefill, router]);

  if (!user?.cartId) {
    return (
      <Screen>
        <View style={styles.top}>
          <Button
            label="Kembali"
            icon="chevron-left"
            variant="ghost"
            fullWidth={false}
            onPress={() => router.back()}
          />
        </View>
        <Card>
          <EmptyState
            icon="moped-off"
            title="Anda tidak bertugas di gerobak ini hari ini"
            subtitle="Hubungi Barista atau Administrator untuk penugasan gerobak hari ini."
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Button
          label="Kembali"
          icon="chevron-left"
          variant="ghost"
          fullWidth={false}
          onPress={() => router.back()}
          disabled={isSubmitting}
        />
      </View>

      <View>
        <Text variant="h2">Request Refill</Text>
        <Text variant="caption" color={semantic.textMuted}>
          Gerobak {user.cartCode ?? '-'}
        </Text>
      </View>

      {productsQuery.isLoading ? (
        <Card>
          <Text color={semantic.textMuted} center>
            Memuat daftar produk...
          </Text>
        </Card>
      ) : productsQuery.isError ? (
        <Card style={styles.stateCard}>
          <EmptyState
            icon="alert-circle-outline"
            title="Gagal memuat produk"
            subtitle="Periksa koneksi internet Anda."
          />
          <Button label="Coba Lagi" variant="secondary" onPress={() => void productsQuery.refetch()} />
        </Card>
      ) : !productsQuery.data || productsQuery.data.length === 0 ? (
        <Card>
          <EmptyState
            icon="coffee-off-outline"
            title="Belum ada produk"
            subtitle="Hubungi Administrator untuk menambahkan produk."
          />
        </Card>
      ) : (
        <Card style={styles.linesCard}>
          {productsQuery.data.map((product) => (
            <View key={product.id} style={styles.lineRow}>
              <View style={styles.lineInfo}>
                <Text variant="bodyStrong">{product.name}</Text>
                <Text variant="caption" color={semantic.textMuted}>
                  {product.unit}
                </Text>
              </View>
              <QtyStepper
                value={qty[product.id] ?? 0}
                onChange={(next) => setQty((prev) => ({ ...prev, [product.id]: next }))}
                max={MAX_PER_LINE}
                disabled={isSubmitting}
              />
            </View>
          ))}
        </Card>
      )}

      <Card accent style={styles.totalCard}>
        <Text variant="caption" color={semantic.textMuted}>
          Total Cups (otomatis)
        </Text>
        <Text variant="display" color={brand[700]}>
          {totalCups}
        </Text>
      </Card>

      <Card style={styles.evidenceCard}>
        <Text variant="bodyStrong">Foto Bukti Frozen Gerobak</Text>
        <Text variant="caption" color={semantic.textMuted}>
          Wajib diambil langsung dari kamera saat ini juga.
        </Text>

        {photo ? (
          <View style={styles.photoBlock}>
            <Image source={{ uri: photo.uri }} style={styles.photo} />
            <Button
              label="Ambil Ulang"
              icon="camera-retake-outline"
              variant="secondary"
              onPress={capturePhoto}
              disabled={isSubmitting}
            />
          </View>
        ) : (
          <Button
            label="Ambil Foto"
            icon="camera-outline"
            onPress={capturePhoto}
            disabled={isSubmitting}
          />
        )}

        {cameraError ? (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={feedback.dangerFg} />
            <Text variant="caption" color={feedback.dangerFg} style={styles.errorText}>
              {cameraError}
            </Text>
          </View>
        ) : null}
      </Card>

      <View style={styles.gpsRow}>
        <MaterialCommunityIcons
          name={gpsStatus === 'granted' ? 'map-marker-check-outline' : 'map-marker-off-outline'}
          size={16}
          color={semantic.textSubtle}
        />
        <Text variant="caption" color={semantic.textSubtle}>
          {gpsStatus === 'checking'
            ? 'Mendeteksi lokasi...'
            : gpsStatus === 'granted'
              ? 'Lokasi terdeteksi'
              : 'Tanpa GPS — tetap bisa dikirim'}
        </Text>
      </View>

      {formError ? (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={feedback.dangerFg} />
          <Text variant="caption" color={feedback.dangerFg} style={styles.errorText}>
            {formError}
          </Text>
        </View>
      ) : null}

      <Button
        label="Kirim Request"
        icon="send-outline"
        onPress={() => void onSubmit()}
        loading={isSubmitting}
        disabled={isSubmitting}
      />

      {/* The photo is re-encoded on the device before it is sent (lib/image.ts), so submit is a
          multi-second operation with two distinct stages. Naming the stage is what stops a staff
          member from deciding the app has frozen and killing it mid-upload. */}
      {isSubmitting ? (
        <Text variant="caption" color={semantic.textSubtle} center>
          {uploadEvidence.isPending
            ? 'Mengompres dan mengunggah foto bukti...'
            : 'Mengirim request...'}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  stateCard: { gap: space.md },

  linesCard: { gap: space.md },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  lineInfo: { flex: 1, gap: space.xxs },

  totalCard: { alignItems: 'center', gap: space.xxs },

  evidenceCard: { gap: space.md },
  photoBlock: { gap: space.md },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    backgroundColor: neutral[100],
  },

  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: feedback.dangerBg,
    borderColor: feedback.dangerBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  errorText: { flex: 1 },
});

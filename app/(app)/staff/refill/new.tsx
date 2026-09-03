import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StatusBar } from 'expo-status-bar';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { SectionTitle } from '@/components/ui/Section';
import { enter } from '@/components/ui/Motion';
import { ProductPickerCard } from '@/components/refill/ProductPickerCard';
import { useAuth } from '@/features/auth/store';
import { useProducts, useSubmitRefill, useUploadEvidence } from '@/features/refill/queries';
import { ApiError } from '@/lib/api';
import { brand, neutral, radius, semantic, shadow, space } from '@/theme';

/**
 * A deliberately different backdrop for this one screen: dark and atmospheric, the white product
 * cards and photo evidence sitting on it like islands rather than blending into the same pale
 * page background every other screen uses. Requesting a refill is the single most important
 * action in the app (requirement 2) — it earns its own mood, not a flat colour swap.
 */
const BACKDROP = '#0B2B2C';
const LIGHT_TEXT = neutral[0];
const LIGHT_MUTED = 'rgba(255,255,255,0.72)';
const LIGHT_SUBTLE = 'rgba(255,255,255,0.56)';

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
  const [placeName, setPlaceName] = useState<string | null>(null);
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
        if (cancelled) return;

        setGps({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGpsStatus('granted');

        // The address is for the human reading this screen; the request itself carries the raw
        // coordinates either way (submitted below via `gps`), so this runs after the coordinates
        // are already committed above, and its failure is silent — a staff member must never be
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
          <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
        </View>
        <Card>
          <EmptyState
            icon="moped-off"
            title="Anda tidak bertugas di gerobak ini hari ini"
            subtitle="Hubungi Barista atau Administrator untuk penugasan gerobak hari ini."
            tone="neutral"
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      background={BACKDROP}
      refreshing={productsQuery.isRefetching}
      // Disabled mid-submit: pulling the list out from under an in-flight upload would be a
      // surprising way to lose a photo that is already on the wire.
      {...(isSubmitting ? {} : { onRefresh: () => void productsQuery.refetch() })}
    >
      {/* Overrides the app-wide dark status bar icons — this screen's dark backdrop bleeds
          under them, and dark-on-dark icons would be unreadable. */}
      <StatusBar style="light" />

      <View style={styles.top}>
        <IconButton icon="chevron-left" label="Kembali" tone="translucent" disabled={isSubmitting} onPress={() => router.back()} />
      </View>

      <View style={styles.headerBlock}>
        <Text variant="h2" color={LIGHT_TEXT}>
          Request Refill
        </Text>
        <Text variant="caption" color={LIGHT_MUTED}>
          Gerobak {user.cartCode ?? '-'}
        </Text>

        {/* The address a coordinate pair alone cannot tell a reviewer — reverse-geocoded from the
            same fix that goes into the request, on-device, so it works with no server round trip
            and needs no separate maps key. Placed directly under the cart code because this is
            the two-line answer to "which cart, and where" that everyone downstream (barista,
            finance, rider) actually reads this screen for. */}
        <View style={styles.locationRow}>
          <MaterialCommunityIcons
            name={gpsStatus === 'granted' ? 'map-marker' : 'map-marker-off-outline'}
            size={14}
            color={gpsStatus === 'granted' ? brand[300] : LIGHT_SUBTLE}
          />
          <Text variant="caption" color={gpsStatus === 'granted' ? LIGHT_MUTED : LIGHT_SUBTLE} numberOfLines={1} style={styles.locationText}>
            {gpsStatus === 'checking'
              ? 'Mendeteksi lokasi...'
              : gpsStatus === 'granted'
                ? (placeName ?? 'Lokasi terdeteksi')
                : 'Tanpa GPS — tetap bisa dikirim'}
          </Text>
        </View>
      </View>

      <SectionTitle
        title="Pilih produk"
        caption={selectedCount > 0 ? `${selectedCount} produk dipilih` : 'Ketuk foto untuk menambah'}
        tone="light"
      />

      {productsQuery.isLoading ? (
        <SkeletonGrid count={6} />
      ) : productsQuery.isError ? (
        <Card style={styles.stateCard}>
          <EmptyState icon="wifi-off" title="Gagal memuat produk" subtitle="Periksa koneksi internet Anda." tone="danger" />
          <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void productsQuery.refetch()} />
        </Card>
      ) : !productsQuery.data || productsQuery.data.length === 0 ? (
        <Card>
          <EmptyState icon="coffee-off-outline" title="Belum ada produk" subtitle="Hubungi Administrator untuk menambahkan produk." tone="neutral" />
        </Card>
      ) : (
        /* A grid of photographs, not a list of names. Staff recognise the drink they are out of
           by sight long before they read its name, and two columns keeps every tile inside a
           thumb's reach. */
        <View style={styles.grid}>
          {productsQuery.data.map((product, index) => (
            <View key={product.id} style={styles.gridCell}>
              <ProductPickerCard
                product={product}
                value={qty[product.id] ?? 0}
                max={MAX_PER_LINE}
                disabled={isSubmitting}
                index={index}
                onChange={(next) => setQty((prev) => ({ ...prev, [product.id]: next }))}
              />
            </View>
          ))}
        </View>
      )}

      <Animated.View entering={enter('below')}>
        <Card style={styles.totalCard} accent>
          <Text variant="caption" color={semantic.textMuted}>
            Total Cups (otomatis)
          </Text>
          <AnimatedNumber value={totalCups} variant="display" color={brand[700]} />
        </Card>
      </Animated.View>

      <Animated.View entering={enter('below')}>
        <Card style={styles.evidenceCard}>
          <Text variant="bodyStrong">Foto Bukti Frozen Gerobak</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Wajib diambil langsung dari kamera saat ini juga.
          </Text>

          {photo ? (
            <View style={styles.photoBlock}>
              <View style={styles.photoFrame}>
                <Image source={{ uri: photo.uri }} style={styles.photo} />
                <View style={styles.photoBadge}>
                  <Chip
                    tone="translucent"
                    label="Foto siap"
                    icon={<MaterialCommunityIcons name="check-circle" size={14} color={neutral[0]} />}
                  />
                </View>
              </View>
              <Button label="Ambil Ulang" icon="camera-retake-outline" variant="secondary" onPress={capturePhoto} disabled={isSubmitting} />
            </View>
          ) : (
            <Button label="Ambil Foto" icon="camera-outline" onPress={capturePhoto} disabled={isSubmitting} />
          )}

          {cameraError ? <Banner message={cameraError} tone="danger" /> : null}
        </Card>
      </Animated.View>

      {formError ? <Banner message={formError} tone="danger" /> : null}

      <Button label="Kirim Request" icon="send" iconTrailing onPress={() => void onSubmit()} loading={isSubmitting} disabled={isSubmitting} />

      {/* The photo is re-encoded on the device before it is sent (lib/image.ts), so submit is a
          multi-second operation with two distinct stages. Naming the stage is what stops a staff
          member from deciding the app has frozen and killing it mid-upload. */}
      {isSubmitting ? (
        <Text variant="caption" color={LIGHT_SUBTLE} center>
          {uploadEvidence.isPending ? 'Mengompres dan mengunggah foto bukti...' : 'Mengirim request...'}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  stateCard: { gap: space.md },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  gridCell: { width: '47.5%', flexGrow: 1 },

  totalCard: { alignItems: 'center', gap: space.xxs },

  evidenceCard: { gap: space.md },
  photoBlock: { gap: space.md },
  photoFrame: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: neutral[100], ...shadow.card },
  photo: { width: '100%', height: 200 },
  photoBadge: { position: 'absolute', left: space.md, bottom: space.md },

  headerBlock: { gap: space.xxs },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xxs },
  locationText: { flex: 1 },
});

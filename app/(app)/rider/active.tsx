import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Modal, ScrollView, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { StatusBadge, Chip } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Touchable } from '@/components/ui/Touchable';
import { SignaturePad, type SignatureResult } from '@/components/ui/SignaturePad';
import { useDeliverRefill, useRefills, useUploadHandoverPhoto } from '@/features/refill/queries';
import { useReportIncident } from '@/features/incidents/queries';
import { ApiError } from '@/lib/api';
import type { RefillRequest } from '@/domain/types';
import { brand, feedback, neutral, radius, semantic, space } from '@/theme';

/**
 * How a delivery is proved, as of 2026-09-10.
 *
 * `none` is the default and the normal case: a photograph of the cups changing hands. The other
 * two are additions a rider may make when the staff member is present and willing — a signature,
 * or their PIN. The old arrangement had this backwards: a signature was required and no photo was
 * collected at all, which meant a rider holding a crate in the street could be unable to close a
 * delivery that had plainly happened, and a dispute had nothing but a squiggle to look at.
 */
type ProofMode = 'none' | 'staff_signature' | 'pin_fallback';
type GpsCoords = { lat: number; lng: number };
type Photo = { uri: string; takenAt: string };

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/** Never a hard block (E10) — any denial, error, or timeout resolves to `null`, not a rejection. */
async function captureGps(): Promise<GpsCoords | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Camera only, never the gallery.
 *
 * The same rule the refill evidence photo lives under (R3): there is no `launchImageLibraryAsync`
 * anywhere in this flow, because a photo that can come from the gallery proves nothing about
 * where anyone was.
 */
async function capturePhoto(): Promise<Photo | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Izin kamera ditolak. Aktifkan izin kamera di pengaturan HP.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  return { uri: result.assets[0].uri, takenAt: new Date().toISOString() };
}

function PhotoField({
  photo,
  title,
  hint,
  disabled,
  onCapture,
}: {
  photo: Photo | null;
  title: string;
  hint: string;
  disabled: boolean;
  onCapture: () => void;
}) {
  return (
    <Card style={styles.card}>
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="caption" color={semantic.textMuted}>
        {hint}
      </Text>

      {photo ? (
        <>
          <View style={styles.photoFrame}>
            <Image source={{ uri: photo.uri }} style={styles.photo} />
          </View>
          <Button label="Ambil Ulang" icon="camera-retake-outline" variant="secondary" disabled={disabled} onPress={onCapture} />
        </>
      ) : (
        <Button label="Ambil Foto" icon="camera-outline" disabled={disabled} onPress={onCapture} />
      )}
    </Card>
  );
}

function DeliverySheet({ refill, onClose }: { refill: RefillRequest; onClose: () => void }) {
  const uploadPhoto = useUploadHandoverPhoto();
  const deliver = useDeliverRefill();

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

  // The photo is the only requirement. A chosen proof mode has to be complete, but choosing one
  // at all is optional.
  const canSubmit =
    photo !== null &&
    (proof === 'none' ||
      (proof === 'staff_signature' && signature !== null) ||
      (proof === 'pin_fallback' && staffPin.length === 6));

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
      setError('Foto serah terima wajib diambil dulu.');
      return;
    }

    try {
      // Uploaded first, then referenced by id: this request may also carry a signature file, and
      // the client streams one file per request on purpose (see lib/api.ts).
      const media = await uploadPhoto.mutateAsync({ uri: photo.uri, takenAt: photo.takenAt });

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

      // 202 means the delivery is recorded but the stock ledger post is still being retried
      // (E19) — the request stays DELIVERED and is never silently closed.
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
    }
  };

  return (
    <View style={styles.sheetRoot}>
      <View style={styles.sheetHeader}>
        <View>
          <Text variant="h3">Selesaikan Pengiriman</Text>
          <Text variant="caption" color={semantic.textMuted}>
            {refill.code}
          </Text>
        </View>
        <IconButton icon="close" label="Tutup" onPress={onClose} />
      </View>

      <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Text variant="h3">{refill.code}</Text>
          <View style={styles.metaChips}>
            <Chip
              label={refill.location_name ?? 'Lokasi tidak diketahui'}
              icon={<MaterialCommunityIcons name="map-marker-outline" size={14} color={semantic.textMuted} />}
            />
            <Chip
              label={refill.staff_name}
              icon={<MaterialCommunityIcons name="account-outline" size={14} color={semantic.textMuted} />}
            />
            <Chip
              label={`Gerobak ${refill.cart_code}`}
              icon={<MaterialCommunityIcons name="moped-outline" size={14} color={semantic.textMuted} />}
            />
          </View>
        </Card>

        <Card style={styles.card}>
          <Text variant="bodyStrong">Jumlah Diterima</Text>
          {/* R15 — no cost shown to Rider. */}
          {refill.lines.map((line) => (
            <View key={line.id} style={styles.lineRow}>
              <Text variant="body" style={styles.lineText} numberOfLines={1}>
                {line.product_name}
              </Text>
              <QtyStepper
                value={qty[line.id] ?? 0}
                onChange={(next) => setQty((prev) => ({ ...prev, [line.id]: next }))}
                max={line.qty_prepared ?? 0}
                capHint={`maks. ${line.qty_prepared ?? 0} (dikirim)`}
              />
            </View>
          ))}
        </Card>

        <PhotoField
          photo={photo}
          title="Foto Serah Terima (wajib)"
          hint="Ambil foto cups yang diserahkan beserta gerobaknya. Ini bukti utama pengiriman."
          disabled={isSubmitting}
          onCapture={() => void takePhoto()}
        />

        <View style={styles.gpsRow}>
          <MaterialCommunityIcons
            name={gpsStatus === 'ok' ? 'map-marker-check-outline' : 'map-marker-off-outline'}
            size={16}
            color={gpsStatus === 'unavailable' ? feedback.warningFg : brand[600]}
          />
          <Text variant="caption" color={semantic.textMuted}>
            {gpsStatus === 'loading' && 'Mengambil lokasi...'}
            {gpsStatus === 'ok' && 'Lokasi berhasil diambil'}
            {gpsStatus === 'unavailable' && 'Lokasi tidak tersedia — pengiriman tetap bisa dilanjutkan'}
          </Text>
        </View>

        <Card style={styles.card}>
          <Text variant="bodyStrong">Tanda tangan staff (opsional)</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Foto di atas sudah cukup. Tambahkan ini hanya jika staff ada di tempat dan bersedia.
          </Text>

          <View style={styles.proofRow}>
            {(
              [
                { mode: 'none' as ProofMode, label: 'Tanpa paraf', icon: 'camera-outline' },
                { mode: 'staff_signature' as ProofMode, label: 'Paraf staff', icon: 'draw' },
                { mode: 'pin_fallback' as ProofMode, label: 'PIN staff', icon: 'dialpad' },
              ]
            ).map((option) => {
              const active = proof === option.mode;

              return (
                <Touchable
                  key={option.mode}
                  onPress={() => {
                    setProof(option.mode);
                    setSignature(null);
                    setStaffPin('');
                    setError(null);
                  }}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: active }}
                  style={[styles.proofOption, active && styles.proofOptionOn]}
                >
                  <MaterialCommunityIcons
                    name={option.icon as never}
                    size={18}
                    color={active ? neutral[0] : brand[700]}
                  />
                  <Text variant="captionStrong" color={active ? neutral[0] : semantic.textMuted}>
                    {option.label}
                  </Text>
                </Touchable>
              );
            })}
          </View>

          {proof === 'staff_signature' ? (
            <SignaturePad onSigned={setSignature} onClear={() => setSignature(null)} />
          ) : null}

          {proof === 'pin_fallback' ? (
            <Input
              label="PIN Staff (6 digit)"
              value={staffPin}
              onChangeText={(t) => setStaffPin(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="123456"
            />
          ) : null}
        </Card>

        {error ? <Banner message={error} tone="danger" /> : null}

        <Button
          label="Konfirmasi Pengiriman"
          icon="check-circle-outline"
          onPress={() => void onSubmit()}
          disabled={!canSubmit || isSubmitting}
          loading={isSubmitting}
        />

        {isSubmitting ? (
          <Text variant="caption" color={semantic.textSubtle} center>
            {uploadPhoto.isPending ? 'Mengunggah foto serah terima...' : 'Menyelesaikan pengiriman...'}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * The accident report.
 *
 * Deliberately does NOT ask the rider what should happen next. Finance or an Administrator
 * decides whether the run is cancelled or the survivors still go out — the rider is the one
 * person who should not rule on their own accident, and either answer has money in it. So this
 * screen collects the facts and says plainly that somebody else will answer.
 */
function IncidentSheet({ refill, onClose }: { refill: RefillRequest; onClose: () => void }) {
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

  return (
    <View style={styles.sheetRoot}>
      <View style={styles.sheetHeader}>
        <View>
          <Text variant="h3">Laporkan Insiden</Text>
          <Text variant="caption" color={semantic.textMuted}>
            {refill.code}
          </Text>
        </View>
        <IconButton icon="close" label="Tutup" onPress={onClose} />
      </View>

      <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        <Banner
          tone="info"
          message="Isi apa yang rusak dan kirim fotonya. Keputusan lanjut atau batal diambil oleh Finance/Administrator, bukan oleh Anda."
        />

        <PhotoField
          photo={photo}
          title="Foto Kerusakan (wajib)"
          hint="Foto cups yang rusak / tumpah, sedekat mungkin. Ini yang dilihat Finance saat memutuskan."
          disabled={report.isPending}
          onCapture={() => void takePhoto()}
        />

        <Card style={styles.card}>
          <Text variant="bodyStrong">Jumlah yang rusak</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Hanya yang benar-benar tidak layak. Sisanya tetap dihitung sebagai cups yang bisa diantar.
          </Text>

          {refill.lines.map((line) => (
            <View key={line.id} style={styles.lineRow}>
              <Text variant="body" style={styles.lineText} numberOfLines={1}>
                {line.product_name}
              </Text>
              <QtyStepper
                value={damaged[line.id] ?? 0}
                onChange={(next) => setDamaged((prev) => ({ ...prev, [line.id]: next }))}
                max={line.qty_prepared ?? 0}
                capHint={`maks. ${line.qty_prepared ?? 0} (dikirim)`}
              />
            </View>
          ))}

          {totalDamaged > 0 ? (
            <Banner
              tone={allDamaged ? 'danger' : 'warning'}
              message={
                allDamaged
                  ? `Semua ${totalDamaged} cups dilaporkan rusak. Finance kemungkinan membatalkan pengantaran dan Anda kembali ke dapur.`
                  : `${totalDamaged} cups dilaporkan rusak. Pisahkan yang rusak dari yang masih layak sambil menunggu keputusan.`
              }
            />
          ) : null}
        </Card>

        <Card style={styles.card}>
          <Input
            label="Keterangan (opsional)"
            value={note}
            onChangeText={setNote}
            placeholder="Mis. jatuh di Jalan Pemuda, tutup cup pecah"
            multiline
            maxLength={500}
          />
        </Card>

        {error ? <Banner message={error} tone="danger" /> : null}

        <Button
          label="Kirim Laporan"
          icon="alert-outline"
          onPress={() => void onSubmit()}
          disabled={report.isPending || !photo || totalDamaged <= 0}
          loading={report.isPending}
        />
      </ScrollView>
    </View>
  );
}

export default function RiderActiveScreen() {
  const refillsQuery = useRefills('PICKED_UP');
  const [deliverId, setDeliverId] = useState<number | null>(null);
  const [incidentId, setIncidentId] = useState<number | null>(null);

  const active = refillsQuery.data ?? [];
  const deliverRefill = active.find((r) => r.id === deliverId) ?? null;
  const incidentRefill = active.find((r) => r.id === incidentId) ?? null;

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <Text variant="h2" style={styles.header}>
        Pengiriman Saya
      </Text>

      {refillsQuery.isLoading ? (
        <View style={styles.listPad}>
          <SkeletonList count={2} lines={2} />
        </View>
      ) : refillsQuery.isError ? (
        <View style={styles.center}>
          <EmptyState icon="wifi-off" title="Gagal memuat pengiriman" subtitle={(refillsQuery.error as Error).message} tone="danger">
            <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={() => void refillsQuery.refetch()} />
          </EmptyState>
        </View>
      ) : (
        <FlatList
          data={active}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshing={refillsQuery.isRefetching}
          onRefresh={() => void refillsQuery.refetch()}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.top}>
                <View style={styles.topText}>
                  <Text variant="h3" numberOfLines={1}>
                    {item.code}
                  </Text>
                  <Text variant="caption" color={semantic.textMuted} numberOfLines={1}>
                    {item.location_name ?? 'Lokasi tidak diketahui'} · {item.staff_name}
                  </Text>
                </View>
                <StatusBadge status={item.status} />
              </View>

              <View style={styles.metaChips}>
                <Chip label={`Gerobak ${item.cart_code}`} icon={<MaterialCommunityIcons name="moped-outline" size={14} color={semantic.textMuted} />} />
                <Chip label={`${item.total_requested} cups`} icon={<MaterialCommunityIcons name="cup-outline" size={14} color={semantic.textMuted} />} />
              </View>

              <Button label="Selesaikan Pengiriman" icon="flag-checkered" onPress={() => setDeliverId(item.id)} disabled={!item.can.deliver} />

              {/* Second, quieter action: something went wrong on the road. Deliberately on the
                  same card as the delivery, because a rider standing over a spilled crate should
                  not have to go looking for it. */}
              <Button
                label="Laporkan Insiden"
                icon="alert-outline"
                variant="ghost"
                size="sm"
                onPress={() => setIncidentId(item.id)}
              />
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState icon="moped-outline" title="Tidak ada pengiriman berjalan" subtitle="Ambil pesanan dari layar Siap Diambil untuk memulai." />
          }
        />
      )}

      <Modal visible={deliverRefill !== null} animationType="slide" onRequestClose={() => setDeliverId(null)}>
        {deliverRefill ? <DeliverySheet refill={deliverRefill} onClose={() => setDeliverId(null)} /> : null}
      </Modal>

      <Modal visible={incidentRefill !== null} animationType="slide" onRequestClose={() => setIncidentId(null)}>
        {incidentRefill ? <IncidentSheet refill={incidentRefill} onClose={() => setIncidentId(null)} /> : null}
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  header: { padding: space.lg, paddingBottom: space.sm },
  listPad: { paddingHorizontal: space.lg },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  card: { gap: space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  topText: { flex: 1, gap: space.xxs },
  metaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    backgroundColor: neutral[50],
    borderRadius: radius.sm,
    padding: space.sm,
  },
  lineText: { flex: 1 },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },

  photoFrame: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: neutral[100] },
  photo: { width: '100%', height: 190 },

  proofRow: { flexDirection: 'row', gap: space.sm },
  proofOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand[200],
    backgroundColor: brand[50],
  },
  proofOptionOn: { backgroundColor: brand[700], borderColor: brand[700] },

  sheetRoot: { flex: 1, backgroundColor: semantic.bg },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
    backgroundColor: '#FFFFFF',
  },
  sheetContent: { padding: space.lg, gap: space.md },
});

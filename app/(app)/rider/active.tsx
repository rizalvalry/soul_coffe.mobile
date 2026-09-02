import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import { File, Paths } from 'expo-file-system';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { StatusBadge } from '@/components/ui/Badge';
import { SignaturePad, type SignatureResult } from '@/components/ui/SignaturePad';
import { useDeliverRefill, useRefills } from '@/features/refill/queries';
import { ApiError } from '@/lib/api';
import type { RefillRequest } from '@/domain/types';
import { brand, feedback, neutral, radius, semantic, space } from '@/theme';

type DeliveryMethod = 'staff_signature' | 'pin_fallback';
type GpsCoords = { lat: number; lng: number };

/**
 * Minimal 1x1 transparent PNG used only for `pin_fallback` deliveries (E7). The flow explicitly
 * switches away from signature capture to a PIN — but `useDeliverRefill()` still uploads a
 * `signature` file for every delivery, so this placeholder satisfies that field honestly
 * (`stroke_count: 0` travels alongside it, so the server never mistakes it for a real signature).
 */
const PIN_FALLBACK_PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function writePlaceholderSignature(): string {
  const file = new File(Paths.cache, `pin-fallback-${Date.now()}.png`);
  file.create({ overwrite: true });
  file.write(PIN_FALLBACK_PLACEHOLDER_PNG_BASE64, { encoding: 'base64' });
  return file.uri;
}

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

function DeliverySheet({ refill, onClose }: { refill: RefillRequest; onClose: () => void }) {
  const deliver = useDeliverRefill();

  const [qty, setQty] = useState<Record<number, number>>(() =>
    Object.fromEntries(refill.lines.map((l) => [l.id, l.qty_prepared ?? 0])),
  );
  const [method, setMethod] = useState<DeliveryMethod>('staff_signature');
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

  const canSubmit = method === 'staff_signature' ? signature !== null : staffPin.length === 6;

  const onSubmit = async () => {
    setError(null);

    let signatureUri: string;
    let strokeCount: number;
    if (method === 'staff_signature') {
      if (!signature) return;
      signatureUri = signature.uri;
      strokeCount = signature.strokeCount;
    } else {
      try {
        signatureUri = writePlaceholderSignature();
      } catch {
        setError('Gagal menyiapkan data verifikasi PIN.');
        return;
      }
      strokeCount = 0;
    }

    try {
      const result = await deliver.mutateAsync({
        id: refill.id,
        signatureUri,
        strokeCount,
        method,
        staffPin: method === 'pin_fallback' ? staffPin : undefined,
        lines: refill.lines.map((l) => ({ line_id: l.id, qty_received: qty[l.id] ?? 0 })),
        gps,
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
        <Text variant="h3">Selesaikan Pengiriman</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Tutup">
          <MaterialCommunityIcons name="close" size={22} color={semantic.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Text variant="bodyStrong">{refill.code}</Text>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={15} color={semantic.textMuted} />
            <Text variant="caption" color={semantic.text}>{refill.location_name ?? 'Lokasi tidak diketahui'}</Text>
          </View>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="account-outline" size={15} color={semantic.textMuted} />
            <Text variant="caption" color={semantic.text}>{refill.staff_name}</Text>
          </View>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="moped-outline" size={15} color={semantic.textMuted} />
            <Text variant="caption" color={semantic.text}>Gerobak {refill.cart_code}</Text>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text variant="bodyStrong">Jumlah Diterima</Text>
          {/* R15 — no cost shown to Rider. */}
          {refill.lines.map((line) => (
            <View key={line.id} style={styles.lineRow}>
              <Text variant="body" style={styles.lineText}>{line.product_name}</Text>
              <QtyStepper
                value={qty[line.id] ?? 0}
                onChange={(next) => setQty((prev) => ({ ...prev, [line.id]: next }))}
                max={line.qty_prepared ?? 0}
                capHint={`maks. ${line.qty_prepared ?? 0} (dikirim)`}
              />
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <View style={styles.gpsRow}>
            <MaterialCommunityIcons
              name={gpsStatus === 'ok' ? 'map-marker-check-outline' : 'map-marker-off-outline'}
              size={16}
              color={gpsStatus === 'unavailable' ? feedback.warningFg : semantic.textMuted}
            />
            <Text variant="caption" color={semantic.textMuted}>
              {gpsStatus === 'loading' && 'Mengambil lokasi...'}
              {gpsStatus === 'ok' && 'Lokasi berhasil diambil'}
              {gpsStatus === 'unavailable' && 'Lokasi tidak tersedia — pengiriman tetap bisa dilanjutkan'}
            </Text>
          </View>
        </Card>

        <Card style={styles.card}>
          {method === 'staff_signature' ? (
            <>
              <Text variant="bodyStrong">Paraf Staff</Text>
              <SignaturePad
                onSigned={setSignature}
                onClear={() => setSignature(null)}
              />
              <Pressable onPress={() => { setMethod('pin_fallback'); setSignature(null); setError(null); }}>
                <Text variant="caption" color={brand[700]} style={styles.link}>
                  Staff tidak bisa paraf?
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text variant="bodyStrong">Verifikasi PIN Staff</Text>
              <Text variant="caption" color={semantic.textMuted}>
                Digunakan saat staff tidak dapat memberikan paraf (E7). Diminta untuk peninjauan Finance.
              </Text>
              <Input
                label="PIN Staff (6 digit)"
                value={staffPin}
                onChangeText={(t) => setStaffPin(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="123456"
              />
              <Pressable onPress={() => { setMethod('staff_signature'); setStaffPin(''); setError(null); }}>
                <Text variant="caption" color={brand[700]} style={styles.link}>
                  Kembali ke paraf staff
                </Text>
              </Pressable>
            </>
          )}
        </Card>

        {error ? (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={feedback.dangerFg} />
            <Text variant="caption" color={feedback.dangerFg} style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Button
          label="Konfirmasi Pengiriman"
          onPress={() => void onSubmit()}
          disabled={!canSubmit}
          loading={deliver.isPending}
        />
      </ScrollView>
    </View>
  );
}

export default function RiderActiveScreen() {
  const refillsQuery = useRefills('PICKED_UP');
  const [openId, setOpenId] = useState<number | null>(null);

  const active = refillsQuery.data ?? [];
  const openRefill = active.find((r) => r.id === openId) ?? null;

  if (refillsQuery.isLoading) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={brand[700]} />
      </Screen>
    );
  }

  if (refillsQuery.isError) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <Card style={styles.stateCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={28} color={feedback.dangerFg} />
          <Text variant="bodyStrong" center>Gagal memuat pengiriman</Text>
          <Text variant="caption" color={semantic.textMuted} center>
            {(refillsQuery.error as Error).message}
          </Text>
          <Button label="Coba Lagi" onPress={() => void refillsQuery.refetch()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <Text variant="h2" style={styles.header}>Pengiriman Saya</Text>

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
                <Text variant="bodyStrong">{item.code}</Text>
                <Text variant="caption" color={semantic.textMuted}>
                  {item.location_name ?? 'Lokasi tidak diketahui'} · {item.staff_name}
                </Text>
              </View>
              <StatusBadge status={item.status} />
            </View>

            <View style={styles.metaRow}>
              <MaterialCommunityIcons name="moped-outline" size={15} color={semantic.textMuted} />
              <Text variant="caption" color={semantic.text}>Gerobak {item.cart_code}</Text>
              <MaterialCommunityIcons name="cup-outline" size={15} color={semantic.textMuted} />
              <Text variant="caption" color={semantic.text}>{item.total_requested} cups</Text>
            </View>

            <Button
              label="Selesaikan Pengiriman"
              onPress={() => setOpenId(item.id)}
              disabled={!item.can.deliver}
            />
          </Card>
        )}
        ListEmptyComponent={
          <Card style={styles.stateCard}>
            <Text variant="caption" color={semantic.textMuted} center>
              Tidak ada pengiriman yang sedang berjalan.
            </Text>
          </Card>
        }
      />

      <Modal
        visible={openRefill !== null}
        animationType="slide"
        onRequestClose={() => setOpenId(null)}
      >
        {openRefill ? <DeliverySheet refill={openRefill} onClose={() => setOpenId(null)} /> : null}
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { padding: space.lg, paddingBottom: space.sm },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  card: { gap: space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  topText: { flex: 1, gap: space.xxs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  lineText: { flex: 1 },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { textDecorationLine: 'underline' },
  errorBanner: { flexDirection: 'row', gap: space.sm, backgroundColor: feedback.dangerBg, borderColor: feedback.dangerBorder, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  errorText: { flex: 1 },
  stateCard: { gap: space.md, alignItems: 'center' },
  sheetRoot: { flex: 1, backgroundColor: semantic.bg },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
    backgroundColor: neutral[0],
  },
  sheetContent: { padding: space.lg, gap: space.md },
});

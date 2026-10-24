import { Image, StyleSheet, View } from 'react-native';
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
import { Input } from '@/components/ui/Input';
import { useNewRefillController } from '@/features/refill/useNewRefillController';
import { NO_CART_TODAY_MESSAGE } from '@/features/showcase/riderDayGate';
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

export default function NewRefillScreen() {
  const {
    router, user, cartRefreshStatus, cartRefreshError, productsQuery, uploadEvidence,
    qty, changeQty, photo, cameraError, gpsStatus, placeName, formError, note, setNote,
    totalCups, selectedCount, isSubmitting, dayGate, gateMessage, capturePhoto, onSubmit,
    maxPerLine, controlsDisabled, refreshProps, retryCartRefresh, refreshProducts,
  } = useNewRefillController();
  if (!user?.cartId) {
    return (
      <Screen>
        <View style={styles.top}>
          <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
        </View>
        <Card>
          <EmptyState
            icon="moped-off"
            title={cartRefreshStatus === 'error' ? 'Coffee Bike belum bisa dicek'
              : cartRefreshStatus === 'loading' ? 'Lagi cek Coffee Bike' : 'Coffee Bike belum dapat stok'}
            subtitle={cartRefreshStatus === 'error'
              ? (cartRefreshError ?? 'Coba cek Coffee Bike lagi ya.')
              : cartRefreshStatus === 'loading' ? 'Lagi cek Coffee Bike kamu...' : NO_CART_TODAY_MESSAGE}
            tone="neutral"
          />
          <Button label="Coba lagi" icon="refresh" onPress={retryCartRefresh} />
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
      {...refreshProps}
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
          Coffee Bike {user.cartCode ?? '-'}
        </Text>

        {/* The address a coordinate pair alone cannot tell a reviewer — reverse-geocoded from the
            same fix that goes into the request, on-device, so it works with no server round trip
            and needs no separate maps key. Placed directly under the cart code because this is
            the two-line answer to "which cart, and where" that everyone downstream (barista,
            finance, runner) actually reads this screen for. */}
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

      {cartRefreshStatus === 'error' ? (
        <Card>
          <Banner tone="warning" message={cartRefreshError ?? 'Coffee Bike belum bisa dicek. Kamu masih bisa pakai Coffee Bike terakhir.'} />
          <Button label="Coba lagi" icon="refresh" onPress={retryCartRefresh} />
        </Card>
      ) : null}

      {gateMessage ? <Banner tone="warning" message={gateMessage} /> : null}
      {dayGate === 'attendance' ? (
        <Button label="Buka Absen" icon="fingerprint" onPress={() => router.push('/absen')} />
      ) : null}

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
          <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={refreshProducts} />
        </Card>
      ) : !productsQuery.data || productsQuery.data.length === 0 ? (
        <Card>
          <EmptyState icon="coffee-off-outline" title="Belum ada produk" subtitle="Hubungi Administrator untuk menambahkan produk." tone="neutral" />
        </Card>
      ) : (
        /* A grid of photographs, not a list of names. Riders recognise the drink they are out of
           by sight long before they read its name, and two columns keeps every tile inside a
           thumb's reach. */
        <View style={styles.grid}>
          {productsQuery.data.map((product, index) => (
            <View key={product.id} style={styles.gridCell}>
              <ProductPickerCard
                product={product}
                value={qty[product.id] ?? 0}
                max={maxPerLine}
                disabled={controlsDisabled}
                index={index}
                onChange={(next) => changeQty(product.id, next)}
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
          <Text variant="bodyStrong">Foto Bukti Frozen Coffee Bike</Text>
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
              <Button label="Ambil Ulang" icon="camera-retake-outline" variant="secondary" onPress={capturePhoto} disabled={controlsDisabled} />
            </View>
          ) : (
            <Button label="Ambil Foto" icon="camera-outline" onPress={capturePhoto} disabled={controlsDisabled} />
          )}

          {cameraError ? <Banner message={cameraError} tone="danger" /> : null}
        </Card>
      </Animated.View>

      <Card>
        <Input label="Catatan lapangan (opsional)" value={note} onChangeText={setNote}
          maxLength={500} multiline placeholder="Contoh: butuh es batu 2 pack, sedotan habis" />
      </Card>

      {formError ? <Banner message={formError} tone="danger" /> : null}

      <Button label="Kirim Request" icon="send" iconTrailing onPress={() => void onSubmit()} loading={isSubmitting} disabled={controlsDisabled} />

      {/* The photo is re-encoded on the device before it is sent (lib/image.ts), so submit is a
          multi-second operation with two distinct stages. Naming the stage is what stops a rider
          from deciding the app has frozen and killing it mid-upload. */}
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

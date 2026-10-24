import { FlatList, Image, Modal, ScrollView, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

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
import { ProductThumbnail } from '@/components/ui/ProductThumbnail';
import { Touchable } from '@/components/ui/Touchable';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { useRunnerActiveController } from '@/features/refill/useRunnerActiveController';
import { useRunnerDeliveryController, type ProofMode } from '@/features/refill/useRunnerDeliveryController';
import { useRunnerIncidentController } from '@/features/refill/useRunnerIncidentController';
import type { Photo } from '@/features/refill/useRunnerEvidence';
import type { RefillRequest } from '@/domain/types';
import { brand, feedback, neutral, radius, semantic, space } from '@/theme';

/**
 * How a delivery is proved, as of 2026-09-10.
 *
 * `none` is the default and the normal case: a photograph of the cups changing hands. The other
 * two are additions a runner may make when the rider is present and willing — a signature,
 * or their PIN. The old arrangement had this backwards: a signature was required and no photo was
 * collected at all, which meant a runner holding a crate in the street could be unable to close a
 * delivery that had plainly happened, and a dispute had nothing but a squiggle to look at.
 */
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
  const {
    qty, photo, proof, staffPin, gpsStatus, error,
    isSubmitting, submitDisabled, isUploading, changeQty, maxReceived, selectProof,
    setSignature, clearSignature, changeStaffPin, takePhoto, onSubmit,
  } = useRunnerDeliveryController(refill, onClose);

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
              label={`Coffee Bike ${refill.cart_code}`}
              icon={<MaterialCommunityIcons name="moped-outline" size={14} color={semantic.textMuted} />}
            />
          </View>
        </Card>

        <Card style={styles.card}>
          <Text variant="bodyStrong">Jumlah Diterima</Text>
          {/* R15 — no cost shown to Runner. */}
          {refill.lines.filter((line) => line.is_operational !== false).map((line) => (
            <View key={line.id} style={styles.lineRow}>
              <ProductThumbnail product={line} />
              <Text variant="body" style={styles.lineText} numberOfLines={1}>
                {line.product_name}
              </Text>
              <QtyStepper
                value={qty[line.id] ?? 0}
                onChange={(next) => changeQty(line.id, next)}
                max={maxReceived(line)}
                capHint={`maks. ${line.qty_prepared ?? 0} (dikirim)`}
              />
            </View>
          ))}
        </Card>

        <PhotoField
          photo={photo}
          title="Foto Serah Terima (wajib)"
          hint="Ambil foto cups yang diserahkan beserta Coffee Bike-nya. Ini bukti utama pengiriman."
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
          <Text variant="bodyStrong">Tanda tangan rider (opsional)</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Foto di atas sudah cukup. Tambahkan ini hanya jika rider ada di tempat dan bersedia.
          </Text>

          <View style={styles.proofRow}>
            {(
              [
                { mode: 'none' as ProofMode, label: 'Tanpa paraf', icon: 'camera-outline' },
                { mode: 'staff_signature' as ProofMode, label: 'Paraf rider', icon: 'draw' },
                { mode: 'pin_fallback' as ProofMode, label: 'PIN rider', icon: 'dialpad' },
              ]
            ).map((option) => {
              const active = proof === option.mode;

              return (
                <Touchable
                  key={option.mode}
                  onPress={() => selectProof(option.mode)}
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
            <SignaturePad onSigned={setSignature} onClear={clearSignature} />
          ) : null}

          {proof === 'pin_fallback' ? (
            <Input
              label="PIN Rider (6 digit)"
              value={staffPin}
              onChangeText={changeStaffPin}
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
          disabled={submitDisabled}
          loading={isSubmitting}
        />

        {isSubmitting ? (
          <Text variant="caption" color={semantic.textSubtle} center>
            {isUploading ? 'Mengunggah foto serah terima...' : 'Menyelesaikan pengiriman...'}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * The accident report.
 *
 * Deliberately does NOT ask the runner what should happen next. Finance or an Administrator
 * decides whether the run is cancelled or the survivors still go out — the runner is the one
 * person who should not rule on their own accident, and either answer has money in it. So this
 * screen collects the facts and says plainly that somebody else will answer.
 */
function IncidentSheet({ refill, onClose }: { refill: RefillRequest; onClose: () => void }) {
  const {
    photo, damaged, note, error, totalDamaged, allDamaged,
    isSubmitting, submitDisabled, changeDamaged, maxDamaged, setNote, takePhoto, onSubmit,
  } = useRunnerIncidentController(refill, onClose);

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
          disabled={isSubmitting}
          onCapture={() => void takePhoto()}
        />

        <Card style={styles.card}>
          <Text variant="bodyStrong">Jumlah yang rusak</Text>
          <Text variant="caption" color={semantic.textMuted}>
            Hanya yang benar-benar tidak layak. Sisanya tetap dihitung sebagai cups yang bisa diantar.
          </Text>

          {refill.lines.filter((line) => line.is_operational !== false).map((line) => (
            <View key={line.id} style={styles.lineRow}>
              <ProductThumbnail product={line} />
              <Text variant="body" style={styles.lineText} numberOfLines={1}>
                {line.product_name}
              </Text>
              <QtyStepper
                value={damaged[line.id] ?? 0}
                onChange={(next) => changeDamaged(line.id, next)}
                max={maxDamaged(line)}
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
          disabled={submitDisabled}
          loading={isSubmitting}
        />
      </ScrollView>
    </View>
  );
}

export default function RiderActiveScreen() {
  const {
    refillsQuery, active, deliverRefill, incidentRefill, refresh,
    openDelivery, closeDelivery, openIncident, closeIncident,
    hasInactiveProducts, deliveryDisabled, incidentDisabled,
  } = useRunnerActiveController();

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
            <Button label="Coba Lagi" icon="refresh" variant="secondary" onPress={refresh} />
          </EmptyState>
        </View>
      ) : (
        <FlatList
          data={active}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshing={refillsQuery.isRefetching}
          onRefresh={refresh}
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
                <Chip label={`Coffee Bike ${item.cart_code}`} icon={<MaterialCommunityIcons name="moped-outline" size={14} color={semantic.textMuted} />} />
                <Chip label={`${item.total_requested} cups`} icon={<MaterialCommunityIcons name="cup-outline" size={14} color={semantic.textMuted} />} />
              </View>

              {hasInactiveProducts(item) ? <Banner tone="warning" message="Request lama ini punya produk yang sudah tidak dipakai. Minta Finance cek dulu ya." /> : null}
              <Button label="Selesaikan Pengiriman" icon="flag-checkered" onPress={() => openDelivery(item)} disabled={deliveryDisabled(item)} />

              {/* Second, quieter action: something went wrong on the road. Deliberately on the
                  same card as the delivery, because a runner standing over a spilled crate should
                  not have to go looking for it. */}
              <Button
                label="Laporkan Insiden"
                icon="alert-outline"
                variant="ghost"
                size="sm"
                onPress={() => openIncident(item)}
                disabled={incidentDisabled(item)}
              />
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState icon="moped-outline" title="Tidak ada pengiriman berjalan" subtitle="Ambil pesanan dari layar Siap Diambil untuk memulai." />
          }
        />
      )}

      <Modal visible={deliverRefill !== null} animationType="slide" onRequestClose={closeDelivery}>
        {deliverRefill ? <DeliverySheet refill={deliverRefill} onClose={closeDelivery} /> : null}
      </Modal>

      <Modal visible={incidentRefill !== null} animationType="slide" onRequestClose={closeIncident}>
        {incidentRefill ? <IncidentSheet refill={incidentRefill} onClose={closeIncident} /> : null}
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

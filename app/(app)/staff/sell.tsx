import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { SectionTitle } from '@/components/ui/Section';
import { Touchable } from '@/components/ui/Touchable';
import { enter } from '@/components/ui/Motion';
import { ProductPickerCard } from '@/components/refill/ProductPickerCard';
import { useAuth } from '@/features/auth/store';
import { useProducts, useMyStock } from '@/features/refill/queries';
import { useAttendanceStatus } from '@/features/showcase/queries';
import { useRecordSale, useTodaySales, useVoidSale } from '@/features/sales/queries';
import type { QueuedSale } from '@/features/sales/offlineQueue';
import { useOfflineSalesQueue } from '@/features/sales/useOfflineSalesQueue';
import { ApiError } from '@/lib/api';
import { PAYMENT_METHODS, type PaymentMethod, type Product, type Sale } from '@/domain/types';
import { brand, feedback, neutral, radius, semantic, shadow, space } from '@/theme';

/** Alasan pembatalan minimal ini panjangnya, sekadar penjaga ketikan asal-asalan. */
const MIN_VOID_REASON_LENGTH = 5;

/**
 * "Catat Penjualan" — the till, as simple as a street vendor's notebook.
 *
 * WHAT IT ASKS FOR, AND WHAT IT REFUSES TO ASK FOR
 * ------------------------------------------------
 * Two taps and a submit: which cups, how many, how it was paid. Nothing else. No price entry, no
 * customer, no receipt number, no time field — all of that is either derived on the server or is
 * not a fact worth a queue's worth of somebody's attention. The template is deliberately the
 * refill screen's product grid, because that grid is the one thing every staff member already
 * knows how to use.
 *
 * WHY THE GRID ONLY SHOWS WHAT IS ON THE CART
 * -------------------------------------------
 * You cannot sell a cup you do not have, and the server refuses an oversell anyway (the ledger is
 * append-only, so a negative cart would poison every total built on it). Showing the whole menu
 * and then rejecting half of it on submit would teach people to distrust the screen; showing
 * only what is really there, with the remaining count on each tile, means the screen and the
 * server always agree.
 *
 * ABSEN FIRST
 * -----------
 * Selling is an act of being on shift. This screen reads that from the server rather than
 * deciding it locally, and when the answer is "not yet" it says so and offers the absen screen
 * instead of a disabled button with no explanation.
 *
 * PRICES
 * ------
 * The running total counts CUPS, not rupiah: R15 strips prices from what a staff account may
 * read on `/products`, so this screen genuinely does not know them. The recorded value comes
 * back from the server after submit and is shown on the day's list, which is what a staff member
 * reconciles against at close-out.
 */

const PAYMENT_LABEL: Record<PaymentMethod, { label: string; icon: string }> = {
  cash: { label: 'Tunai', icon: 'cash' },
  qris: { label: 'QRIS', icon: 'qrcode-scan' },
  transfer: { label: 'Transfer', icon: 'bank-transfer' },
};

function rupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function clockOf(iso: string): string {
  const at = new Date(iso);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/**
 * One row in "Transaksi hari ini", with the undo built in.
 *
 * The reason field expands inline rather than popping a dialog — the same pattern Finance's
 * approval screen uses for a rejection reason, so a staff member never meets a native
 * `Alert.prompt`, which does not exist on Android anyway.
 *
 * The server is the only place that actually decides whether this void is still allowed (the
 * window, whose sale it is, whether the day is already settled); this row just offers the button
 * and shows whatever sentence comes back once it is too late.
 */
function SaleHistoryRow({ sale, isFirst }: { sale: Sale; isFirst: boolean }) {
  const voidSale = useVoidSale();

  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onConfirmVoid = async () => {
    setError(null);

    if (reason.trim().length < MIN_VOID_REASON_LENGTH) {
      setError(`Alasan pembatalan wajib diisi (min. ${MIN_VOID_REASON_LENGTH} karakter).`);
      return;
    }

    try {
      await voidSale.mutateAsync({ saleId: sale.id, reason: reason.trim() });
      setExpanded(false);
      setReason('');
    } catch (e) {
      // A 422 here carries the server's own sentence — "Pembatalan hanya bisa dilakukan dalam
      // 10 menit…", "sudah direkonsiliasi…" — more useful than anything invented here.
      setError(e instanceof ApiError ? e.message : 'Gagal membatalkan transaksi. Coba lagi.');
    }
  };

  if (sale.is_voided) {
    return (
      <View style={[styles.historyRow, !isFirst && styles.historyRowDivided, styles.historyRowVoided]}>
        <View style={styles.historyRowMain}>
          <View style={styles.historyTime}>
            <Text variant="captionStrong" color={semantic.textSubtle}>
              {clockOf(sale.occurred_at)}
            </Text>
            <Chip tone="neutral" label="Dibatalkan" />
          </View>

          <View style={styles.historyBody}>
            <Text variant="body" numberOfLines={1} color={semantic.textSubtle} style={styles.strikethrough}>
              {sale.lines.map((line) => `${line.qty}× ${line.product_name ?? 'produk'}`).join(', ')}
            </Text>
            <Text variant="micro" color={semantic.textSubtle} numberOfLines={1}>
              {sale.void_reason}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.historyRow, !isFirst && styles.historyRowDivided]}>
      <View style={styles.historyRowMain}>
        <View style={styles.historyTime}>
          <Text variant="captionStrong">{clockOf(sale.occurred_at)}</Text>
          <Text variant="micro" color={semantic.textSubtle}>
            {PAYMENT_LABEL[sale.payment_method]?.label ?? sale.payment_method}
          </Text>
        </View>

        <View style={styles.historyBody}>
          <Text variant="body" numberOfLines={1}>
            {sale.lines.map((line) => `${line.qty}× ${line.product_name ?? 'produk'}`).join(', ')}
          </Text>
        </View>

        <View style={styles.historyRight}>
          <Text variant="bodyStrong">{sale.total_qty}</Text>
          <Text variant="micro" color={semantic.textSubtle}>
            {rupiah(sale.total_amount)}
          </Text>
        </View>

        <Touchable
          onPress={() => setExpanded((prev) => !prev)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Batalkan transaksi pukul ${clockOf(sale.occurred_at)}`}
          style={styles.historyVoidButton}
        >
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'close-circle-outline'}
            size={18}
            color={feedback.dangerFg}
          />
        </Touchable>
      </View>

      {expanded ? (
        <View style={styles.voidPanel}>
          <Input
            label="Alasan Pembatalan"
            placeholder="Mis. salah pilih produk, dobel input"
            value={reason}
            onChangeText={setReason}
            editable={!voidSale.isPending}
          />

          {error ? <Banner message={error} tone="danger" /> : null}

          <View style={styles.voidActions}>
            <Button
              label="Batal"
              variant="ghost"
              fullWidth={false}
              style={styles.voidActionBtn}
              disabled={voidSale.isPending}
              onPress={() => {
                setExpanded(false);
                setReason('');
                setError(null);
              }}
            />
            <Button
              label="Konfirmasi Batalkan Transaksi"
              variant="danger"
              fullWidth={false}
              style={styles.voidActionBtn}
              loading={voidSale.isPending}
              disabled={voidSale.isPending}
              onPress={() => void onConfirmVoid()}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One sale still sitting on this phone, not yet confirmed by the server.
 *
 * Deliberately not a `Sale` — a queued entry has no server id, no `occurred_at`, and above all
 * no price: R15 strips cost/sell prices from what a STAFF account may read from `/products`, so
 * this screen never knew the rupiah value of what it just sold, online or not. What it CAN show
 * is which cups and how many, from the same product list the picker grid already loaded.
 */
function PendingSaleRow({
  entry,
  productName,
  isFirst,
}: {
  entry: QueuedSale;
  productName: (productId: number) => string;
  isFirst: boolean;
}) {
  return (
    <View style={[styles.historyRow, !isFirst && styles.historyRowDivided]}>
      <View style={styles.historyRowMain}>
        <View style={styles.historyTime}>
          <Text variant="captionStrong">{clockOf(entry.queuedAt)}</Text>
          <Chip
            tone="neutral"
            label="Menunggu koneksi"
            icon={<MaterialCommunityIcons name="cloud-off-outline" size={12} color={semantic.textMuted} />}
          />
        </View>

        <View style={styles.historyBody}>
          <Text variant="body" numberOfLines={1}>
            {entry.input.lines.map((line) => `${line.qty}× ${productName(line.product_id)}`).join(', ')}
          </Text>
        </View>

        <View style={styles.historyRight}>
          <Text variant="bodyStrong">{entry.input.lines.reduce((sum, line) => sum + line.qty, 0)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function SellScreen() {
  const router = useRouter();
  const user = useAuth((s) => s.session?.user);

  const absen = useAttendanceStatus();
  const productsQuery = useProducts();
  const stockQuery = useMyStock();
  const salesQuery = useTodaySales();
  const recordSale = useRecordSale();
  const offlineQueue = useOfflineSalesQueue();

  const [qty, setQty] = useState<Record<number, number>>({});
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<{ cups: number; amount: number } | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);

  const productName = useCallback(
    (productId: number): string =>
      (productsQuery.data ?? []).find((p: Product) => p.id === productId)?.name ?? 'produk',
    [productsQuery.data],
  );

  // Best-effort, exactly as on the refill screen (E10). A denied or unavailable fix costs the
  // area analysis one precise point and costs the transaction nothing.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        const granted = permission.granted
          ? true
          : (await Location.requestForegroundPermissionsAsync()).granted;

        if (!granted) return;

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.LocationAccuracy.Balanced,
        });

        if (!cancelled) {
          setGps({ lat: position.coords.latitude, lng: position.coords.longitude });
        }
      } catch {
        // Leave gps null; the submit reports it as unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Only the products actually on this cart, each capped at what is left of it. */
  const sellable = useMemo(() => {
    const products = productsQuery.data ?? [];
    const onHand = new Map((stockQuery.data ?? []).map((row) => [row.product_id, row.on_hand]));

    return products
      .filter((product) => (onHand.get(product.id) ?? 0) > 0)
      .map((product) => ({ product, available: onHand.get(product.id) ?? 0 }));
  }, [productsQuery.data, stockQuery.data]);

  const totalCups = useMemo(() => Object.values(qty).reduce((sum, n) => sum + n, 0), [qty]);
  const todayCups = useMemo(
    () => (salesQuery.data ?? []).reduce((sum, sale) => sum + sale.total_qty, 0),
    [salesQuery.data],
  );
  const todayAmount = useMemo(
    () => (salesQuery.data ?? []).reduce((sum, sale) => sum + sale.total_amount, 0),
    [salesQuery.data],
  );

  const isSubmitting = recordSale.isPending;
  const hasClockedIn = absen.data?.has_clocked_in ?? false;

  const onSubmit = useCallback(async () => {
    setFormError(null);
    setLastSale(null);
    setQueuedOffline(false);
    offlineQueue.clearLastFailure();

    if (totalCups <= 0) {
      setFormError('Pilih dulu cups yang terjual.');
      return;
    }

    const lines = Object.entries(qty)
      .map(([productId, sold]) => ({ product_id: Number(productId), qty: sold }))
      .filter((line) => line.qty > 0);

    try {
      const sale = await recordSale.mutateAsync({ lines, paymentMethod: payment, gps });

      // The form empties itself: the next customer is already waiting, and a screen that keeps
      // the last order on it is a screen that will eventually record it twice.
      setQty({});
      setLastSale({ cups: sale.total_qty, amount: sale.total_amount });
    } catch (e) {
      // No response at all, rather than the server refusing the sale: queue it instead of
      // failing the till. The staff member's own record of what they just sold must not depend
      // on a bar of signal that happens to be missing at this exact moment.
      if (e instanceof ApiError && e.isOffline) {
        await offlineQueue.enqueue({ lines, paymentMethod: payment, gps });
        setQty({});
        setQueuedOffline(true);
        return;
      }

      if (e instanceof ApiError) {
        // A 422 here carries the server's own sentence — "Absen dulu…", "Stok gerobak untuk
        // Kopi Susu hanya 3 cup." — which is more useful than anything this screen could invent.
        setFormError(e.message);
      } else {
        setFormError('Terjadi kesalahan tidak terduga. Coba lagi.');
      }
    }
  }, [totalCups, qty, payment, gps, recordSale, offlineQueue]);

  if (!user?.cartId) {
    return (
      <Screen>
        <View style={styles.top}>
          <IconButton icon="chevron-left" label="Kembali" onPress={() => router.back()} />
        </View>
        <Card>
          <EmptyState
            icon="moped-off"
            title="Anda tidak bertugas di gerobak hari ini"
            subtitle="Hubungi Barista atau Administrator untuk penugasan gerobak hari ini."
            tone="neutral"
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      refreshing={stockQuery.isRefetching || salesQuery.isRefetching}
      {...(isSubmitting
        ? {}
        : {
            onRefresh: () => {
              void stockQuery.refetch();
              void salesQuery.refetch();
            },
          })}
    >
      <View style={styles.top}>
        <IconButton icon="chevron-left" label="Kembali" disabled={isSubmitting} onPress={() => router.back()} />
      </View>

      <View style={styles.headerBlock}>
        <Text variant="h2">Catat Penjualan</Text>
        <Text variant="caption" color={semantic.textMuted}>
          Gerobak {user.cartCode ?? '-'} · stok berkurang otomatis
        </Text>
      </View>

      {offlineQueue.hasQueued ? (
        <Card style={styles.queueCard}>
          <View style={styles.queueRow}>
            <MaterialCommunityIcons name="cloud-upload-outline" size={20} color={brand[600]} />
            <Text variant="body" style={styles.queueText}>
              {offlineQueue.queue.length} transaksi menunggu terkirim ke server.
            </Text>
          </View>
          <Button
            label="Kirim Sekarang"
            icon="refresh"
            variant="secondary"
            size="sm"
            loading={offlineQueue.flushing}
            onPress={() => void offlineQueue.flushNow()}
          />
        </Card>
      ) : null}

      {absen.isLoading ? null : hasClockedIn ? null : (
        <Card style={styles.gateCard}>
          <EmptyState
            icon="fingerprint-off"
            title="Absen dulu sebelum mencatat penjualan"
            subtitle={absen.data?.blocked_reason ?? 'Penjualan tercatat atas nama shift Anda hari ini.'}
            tone="neutral"
          />
          <Button label="Buka Absen" icon="fingerprint" onPress={() => router.push('/absen')} />
        </Card>
      )}

      <Animated.View entering={enter('below')}>
        <Card style={styles.todayCard}>
          <View style={styles.todayRow}>
            <View style={styles.todayCell}>
              <Text variant="caption" color={semantic.textMuted}>
                Terjual hari ini
              </Text>
              <Text variant="h3">{todayCups} cups</Text>
            </View>
            <View style={styles.todayDivider} />
            <View style={styles.todayCell}>
              <Text variant="caption" color={semantic.textMuted}>
                Nilai hari ini
              </Text>
              <Text variant="h3">{rupiah(todayAmount)}</Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      <SectionTitle
        title="Cups yang terjual"
        caption={totalCups > 0 ? `${totalCups} cups dipilih` : 'Ketuk foto untuk menambah'}
      />

      {productsQuery.isLoading || stockQuery.isLoading ? (
        <SkeletonGrid count={4} />
      ) : productsQuery.isError || stockQuery.isError ? (
        <Card style={styles.stateCard}>
          <EmptyState icon="wifi-off" title="Gagal memuat stok gerobak" subtitle="Periksa koneksi internet Anda." tone="danger" />
          <Button
            label="Coba Lagi"
            icon="refresh"
            variant="secondary"
            onPress={() => {
              void productsQuery.refetch();
              void stockQuery.refetch();
            }}
          />
        </Card>
      ) : sellable.length === 0 ? (
        <Card style={styles.stateCard}>
          <EmptyState
            icon="cup-off-outline"
            title="Stok gerobak kosong"
            subtitle="Tidak ada cups yang bisa dijual. Ajukan refill supaya stok terisi lagi."
            tone="neutral"
          />
          <Button label="Request Refill" icon="plus-box-outline" variant="secondary" onPress={() => router.push('/staff/refill/new')} />
        </Card>
      ) : (
        <View style={styles.grid}>
          {sellable.map(({ product, available }, index) => (
            <View key={product.id} style={styles.gridCell}>
              <ProductPickerCard
                product={product}
                value={qty[product.id] ?? 0}
                // The cap is what is really on the cart, so the stepper simply stops where the
                // stock does instead of letting someone build an order the server must refuse.
                max={available}
                disabled={isSubmitting || !hasClockedIn}
                index={index}
                onChange={(next) => setQty((prev) => ({ ...prev, [product.id]: next }))}
              />
              <View style={styles.stockTag}>
                <Chip
                  tone="neutral"
                  label={`sisa ${available - (qty[product.id] ?? 0)} ${product.unit}`}
                  icon={<MaterialCommunityIcons name="cup-outline" size={12} color={semantic.textMuted} />}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      <Animated.View entering={enter('below')}>
        <Card style={styles.totalCard} accent>
          <Text variant="caption" color={semantic.textMuted}>
            Total cups (otomatis)
          </Text>
          <AnimatedNumber value={totalCups} variant="display" color={brand[700]} />
        </Card>
      </Animated.View>

      <Animated.View entering={enter('below')}>
        <Card style={styles.paymentCard}>
          <Text variant="bodyStrong">Cara bayar</Text>
          <View style={styles.paymentRow}>
            {PAYMENT_METHODS.map((method) => {
              const active = payment === method;
              const meta = PAYMENT_LABEL[method];

              return (
                <Touchable
                  key={method}
                  onPress={() => setPayment(method)}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel={meta.label}
                  accessibilityState={{ selected: active }}
                  style={[styles.paymentOption, active && styles.paymentOptionOn]}
                >
                  <MaterialCommunityIcons
                    name={meta.icon as never}
                    size={20}
                    color={active ? neutral[0] : brand[700]}
                  />
                  <Text variant="captionStrong" color={active ? neutral[0] : semantic.textMuted}>
                    {meta.label}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </Card>
      </Animated.View>

      {formError ? <Banner message={formError} tone="danger" /> : null}

      {lastSale ? (
        <Banner
          tone="success"
          message={`Tercatat: ${lastSale.cups} cups · ${rupiah(lastSale.amount)}. Stok gerobak sudah dikurangi.`}
        />
      ) : null}

      {queuedOffline ? (
        <Banner
          tone="info"
          message="Tidak ada koneksi — transaksi tersimpan di HP ini dan akan terkirim otomatis begitu sinyal kembali."
        />
      ) : null}

      {offlineQueue.lastFailure ? (
        <Banner
          tone="danger"
          message={`Satu transaksi yang menunggu ditolak server: ${offlineQueue.lastFailure}`}
        />
      ) : null}

      <Button
        label="Simpan Transaksi"
        icon="check"
        iconTrailing
        onPress={() => void onSubmit()}
        loading={isSubmitting}
        disabled={isSubmitting || !hasClockedIn || totalCups <= 0}
      />

      {(salesQuery.data ?? []).length > 0 || offlineQueue.queue.length > 0 ? (
        <>
          <SectionTitle
            title="Transaksi hari ini"
            caption={`${(salesQuery.data ?? []).length + offlineQueue.queue.length} transaksi`}
          />

          <Card style={styles.historyCard}>
            {/* Newest first, and a just-queued sale is always the newest thing that happened —
                so pending rows sit above whatever the server has already confirmed. */}
            {offlineQueue.queue.map((entry, index) => (
              <PendingSaleRow key={entry.uuid} entry={entry} productName={productName} isFirst={index === 0} />
            ))}
            {(salesQuery.data ?? []).map((sale, index) => (
              <SaleHistoryRow
                key={sale.uuid}
                sale={sale}
                isFirst={index === 0 && offlineQueue.queue.length === 0}
              />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  headerBlock: { gap: space.xxs },

  gateCard: { gap: space.md },
  stateCard: { gap: space.md },
  queueCard: { gap: space.sm, backgroundColor: brand[50] },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  queueText: { flex: 1 },

  todayCard: { paddingVertical: space.md },
  todayRow: { flexDirection: 'row', alignItems: 'center' },
  todayCell: { flex: 1, gap: space.xxs, alignItems: 'center' },
  todayDivider: { width: 1, height: 36, backgroundColor: semantic.border },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  gridCell: { width: '47.5%', flexGrow: 1, gap: space.xs },
  stockTag: { alignItems: 'center' },

  totalCard: { alignItems: 'center', gap: space.xxs },

  paymentCard: { gap: space.md },
  paymentRow: { flexDirection: 'row', gap: space.sm },
  paymentOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand[200],
    backgroundColor: brand[50],
  },
  paymentOptionOn: { backgroundColor: brand[700], borderColor: brand[700] },

  historyCard: { gap: 0, paddingVertical: space.xs, ...shadow.card },
  // Column container: holds the row itself and, when a void is in progress, the reason panel
  // stacked underneath it. The row's own horizontal layout lives in `historyRowMain`.
  historyRow: { paddingVertical: space.sm },
  historyRowDivided: { borderTopWidth: 1, borderTopColor: semantic.border },
  historyRowVoided: { opacity: 0.6 },
  historyRowMain: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  historyTime: { width: 56, gap: 2 },
  historyBody: { flex: 1, gap: 2 },
  historyRight: { alignItems: 'flex-end', gap: 2 },
  historyVoidButton: { padding: space.xxs },
  strikethrough: { textDecorationLine: 'line-through' },

  voidPanel: { marginTop: space.sm, gap: space.sm },
  voidActions: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
  voidActionBtn: { minWidth: 0 },
});

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
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { SectionTitle } from '@/components/ui/Section';
import { Touchable } from '@/components/ui/Touchable';
import { enter } from '@/components/ui/Motion';
import { ProductPickerCard } from '@/components/refill/ProductPickerCard';
import { useAuth } from '@/features/auth/store';
import { useProducts, useMyStock } from '@/features/refill/queries';
import { useAttendanceStatus } from '@/features/showcase/queries';
import { useRecordSale, useTodaySales } from '@/features/sales/queries';
import { ApiError } from '@/lib/api';
import { PAYMENT_METHODS, type PaymentMethod } from '@/domain/types';
import { brand, neutral, radius, semantic, shadow, space } from '@/theme';

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

export default function SellScreen() {
  const router = useRouter();
  const user = useAuth((s) => s.session?.user);

  const absen = useAttendanceStatus();
  const productsQuery = useProducts();
  const stockQuery = useMyStock();
  const salesQuery = useTodaySales();
  const recordSale = useRecordSale();

  const [qty, setQty] = useState<Record<number, number>>({});
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<{ cups: number; amount: number } | null>(null);

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
      if (e instanceof ApiError) {
        // A 422 here carries the server's own sentence — "Absen dulu…", "Stok gerobak untuk
        // Kopi Susu hanya 3 cup." — which is more useful than anything this screen could invent.
        setFormError(e.message);
      } else {
        setFormError('Terjadi kesalahan tidak terduga. Coba lagi.');
      }
    }
  }, [totalCups, qty, payment, gps, recordSale]);

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

      <Button
        label="Simpan Transaksi"
        icon="check"
        iconTrailing
        onPress={() => void onSubmit()}
        loading={isSubmitting}
        disabled={isSubmitting || !hasClockedIn || totalCups <= 0}
      />

      {(salesQuery.data ?? []).length > 0 ? (
        <>
          <SectionTitle title="Transaksi hari ini" caption={`${(salesQuery.data ?? []).length} transaksi`} />

          <Card style={styles.historyCard}>
            {(salesQuery.data ?? []).map((sale, index) => (
              <View key={sale.uuid} style={[styles.historyRow, index > 0 && styles.historyRowDivided]}>
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
              </View>
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
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  historyRowDivided: { borderTopWidth: 1, borderTopColor: semantic.border },
  historyTime: { width: 56, gap: 2 },
  historyBody: { flex: 1 },
  historyRight: { alignItems: 'flex-end', gap: 2 },
});

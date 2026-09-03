import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { Chip } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Touchable } from '@/components/ui/Touchable';
import { MetaRow, SectionTitle } from '@/components/ui/Section';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { enter } from '@/components/ui/Motion';
import { useProducts } from '@/features/refill/queries';
import {
  useCartAllowance,
  useCarts,
  useHandToCart,
  useShowcaseStaff,
  useShowcaseStock,
} from '@/features/showcase/queries';
import { ApiError } from '@/lib/api';
import { brand, pressScale, radius, semantic, space } from '@/theme';

/**
 * Add Stock — the barista moves cups out of the showcase onto one gerobak.
 *
 * The order on screen is the order of the real task: which gerobak, who is on it, how many cups.
 * The money field comes last and already carries today's amount, because the whole point of the
 * feature is that the barista only has to think about cups.
 *
 * Handing the cups over is also what puts the gerobak on today's roster (see the backend's
 * CentralStockService::handToCart), so nothing here asks the barista to create an assignment
 * first — a gerobak can never be blocked from selling by paperwork nobody did.
 */
export default function BaristaAddStockScreen() {
  const cartsQuery = useCarts();
  const staffQuery = useShowcaseStaff();
  const productsQuery = useProducts();
  const showcaseQuery = useShowcaseStock();
  const handToCart = useHandToCart();

  const [cartId, setCartId] = useState<number | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [qtyByProduct, setQtyByProduct] = useState<Record<number, number>>({});
  const [allowanceText, setAllowanceText] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  const allowanceQuery = useCartAllowance(cartId);

  const carts = useMemo(
    () => (cartsQuery.data ?? []).filter((cart) => cart.status === 'active'),
    [cartsQuery.data],
  );
  const staffList = staffQuery.data ?? [];
  const products = useMemo(
    () => [...(productsQuery.data ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [productsQuery.data],
  );

  /** Cups available to hand out, per product — a stepper must not offer more than the showcase holds. */
  const availableByProduct = useMemo(() => {
    const map: Record<number, number> = {};
    for (const row of showcaseQuery.data ?? []) map[row.product_id] = row.on_hand;
    return map;
  }, [showcaseQuery.data]);

  // The money field is pre-filled from the server, not from a constant here: the amount is a
  // business tunable and a second copy in the app would drift from it.
  useEffect(() => {
    if (allowanceQuery.data) setAllowanceText(String(allowanceQuery.data.amount_minor));
  }, [allowanceQuery.data]);

  const selectedCart = carts.find((cart) => cart.id === cartId);
  const selectedStaff = staffList.find((staff) => staff.id === staffId);

  const totalCups = Object.values(qtyByProduct).reduce((sum, n) => sum + n, 0);
  const allowanceAmount = Number.parseInt(allowanceText || '0', 10);
  const allowanceChanged =
    allowanceQuery.data !== undefined && allowanceAmount !== allowanceQuery.data.amount_minor;

  /**
   * R11: one gerobak per staff per day. The picker already shows an existing placement, so this
   * is caught before the barista types anything rather than after.
   */
  const staffConflict =
    selectedStaff?.assigned_cart_id != null && selectedStaff.assigned_cart_id !== cartId
      ? `${selectedStaff.name} sudah bertugas di gerobak ${selectedStaff.assigned_cart_code} hari ini.`
      : null;

  const canSubmit =
    cartId !== null &&
    staffId !== null &&
    totalCups > 0 &&
    !staffConflict &&
    Number.isFinite(allowanceAmount) &&
    allowanceAmount >= 0;

  const submit = async () => {
    if (!canSubmit || !selectedCart || !selectedStaff) return;
    setBanner(null);

    try {
      const result = await handToCart.mutateAsync({
        cartId: selectedCart.id,
        staffId: selectedStaff.id,
        lines: products.map((p) => ({ product_id: p.id, qty: qtyByProduct[p.id] ?? 0 })),
        // Only sent when the barista actually moved it — submitting the pre-filled value
        // unchanged should not read as a deliberate override in the audit trail.
        ...(allowanceChanged ? { allowanceAmount } : {}),
      });

      setQtyByProduct({});
      Alert.alert(
        'Stock terkirim',
        `${totalCups} cups masuk ke gerobak ${result.cart_code} untuk ${result.staff_name}. ` +
          'Stok gerobak di aplikasi staff sudah ikut ter-update.',
      );
    } catch (e) {
      setBanner(e instanceof ApiError ? e.message : 'Terjadi kesalahan tidak terduga.');
    }
  };

  const isLoading =
    cartsQuery.isLoading || staffQuery.isLoading || productsQuery.isLoading || showcaseQuery.isLoading;
  const isError = cartsQuery.isError || staffQuery.isError || productsQuery.isError;

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList count={3} lines={1} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <Card style={styles.stateCard}>
          <EmptyState
            icon="wifi-off"
            title="Gagal memuat data"
            subtitle="Periksa koneksi Anda."
            tone="danger"
          />
          <Button
            label="Coba Lagi"
            icon="refresh"
            onPress={() => {
              void cartsQuery.refetch();
              void staffQuery.refetch();
              void productsQuery.refetch();
              void showcaseQuery.refetch();
            }}
          />
        </Card>
      </Screen>
    );
  }

  const refreshing =
    cartsQuery.isRefetching || staffQuery.isRefetching || showcaseQuery.isRefetching;
  const refresh = () => {
    void cartsQuery.refetch();
    void staffQuery.refetch();
    void showcaseQuery.refetch();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Text variant="h2">Add Stock</Text>
      <Text variant="caption" color={semantic.textMuted}>
        Pindahkan cups dari showcase ke gerobak. Uang harian sudah terisi otomatis.
      </Text>

      {/* 1 — gerobak */}
      <SectionTitle title="1. Pilih gerobak" caption={`${carts.length} gerobak aktif`} icon="moped-outline" />
      <Card style={styles.card}>
        {carts.length === 0 ? (
          <EmptyState icon="moped-outline" title="Tidak ada gerobak aktif" subtitle="Hubungi admin." tone="neutral" />
        ) : (
          <View style={styles.pickList}>
            {carts.map((cart, index) => {
              const active = cart.id === cartId;
              return (
                <Animated.View key={cart.id} entering={enter('below', index, 8)}>
                  <Touchable
                    onPress={() => {
                      setCartId(cart.id);
                      setBanner(null);
                    }}
                    scaleTo={pressScale.surface}
                    accessibilityRole="button"
                    accessibilityLabel={`Pilih gerobak ${cart.code}`}
                    accessibilityState={{ selected: active }}
                    style={[styles.pickRow, active && styles.pickRowActive]}
                  >
                    <View style={styles.pickAvatar}>
                      <MaterialCommunityIcons
                        name="moped-outline"
                        size={20}
                        color={active ? brand[700] : semantic.textMuted}
                      />
                    </View>
                    <View style={styles.pickText}>
                      <Text variant="bodyStrong">Gerobak {cart.code}</Text>
                      <Text variant="caption" color={semantic.textMuted}>
                        {cart.plate ?? 'Tanpa plat'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name={active ? 'check-circle' : 'chevron-right'}
                      size={active ? 22 : 20}
                      color={active ? brand[700] : semantic.textSubtle}
                    />
                  </Touchable>
                </Animated.View>
              );
            })}
          </View>
        )}
      </Card>

      {/* 2 — staff */}
      {cartId !== null ? (
        <Animated.View entering={enter('below')}>
          <SectionTitle title="2. Pilih staff" caption="Yang bertugas di gerobak ini" icon="account-outline" />
          <Card style={styles.card}>
            {staffList.length === 0 ? (
              <EmptyState icon="account-off-outline" title="Tidak ada staff aktif" subtitle="Hubungi admin." tone="neutral" />
            ) : (
              <View style={styles.pickList}>
                {staffList.map((staff, index) => {
                  const active = staff.id === staffId;
                  // Already on ANOTHER gerobak today — shown, but flagged, so the barista sees
                  // the clash before typing rather than after submitting.
                  const elsewhere =
                    staff.assigned_cart_id != null && staff.assigned_cart_id !== cartId;
                  return (
                    <Animated.View key={staff.id} entering={enter('below', index, 8)}>
                      <Touchable
                        onPress={() => {
                          setStaffId(staff.id);
                          setBanner(null);
                        }}
                        scaleTo={pressScale.surface}
                        accessibilityRole="button"
                        accessibilityLabel={`Pilih ${staff.name}`}
                        accessibilityState={{ selected: active }}
                        style={[styles.pickRow, active && styles.pickRowActive]}
                      >
                        <View style={styles.pickAvatar}>
                          <MaterialCommunityIcons
                            name="account"
                            size={20}
                            color={active ? brand[700] : semantic.textMuted}
                          />
                        </View>
                        <View style={styles.pickText}>
                          <Text variant="bodyStrong">{staff.name}</Text>
                          <Text variant="caption" color={semantic.textMuted}>
                            {staff.assigned_cart_code
                              ? `Gerobak ${staff.assigned_cart_code}`
                              : 'Belum ada penugasan hari ini'}
                          </Text>
                        </View>
                        {elsewhere ? <Chip tone="amber" label="TERPAKAI" /> : null}
                        <MaterialCommunityIcons
                          name={active ? 'check-circle' : 'chevron-right'}
                          size={active ? 22 : 20}
                          color={active ? brand[700] : semantic.textSubtle}
                        />
                      </Touchable>
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </Card>
        </Animated.View>
      ) : null}

      {/* 3 — cups + money, one form as specified */}
      {cartId !== null && staffId !== null ? (
        <Animated.View entering={enter('below')}>
          <SectionTitle title="3. Jumlah cups & uang harian" icon="cup-outline" />
          <Card style={styles.card}>
            {staffConflict ? <Banner tone="warning" message={staffConflict} /> : null}

            <View style={styles.lines}>
              {products.map((p) => {
                const available = availableByProduct[p.id] ?? 0;
                return (
                  <View key={p.id} style={styles.lineRow}>
                    <View style={styles.lineText}>
                      <Text variant="body" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text variant="micro" color={semantic.textSubtle}>
                        Showcase: {available} {p.unit}
                      </Text>
                    </View>
                    <QtyStepper
                      value={qtyByProduct[p.id] ?? 0}
                      onChange={(next) => setQtyByProduct((prev) => ({ ...prev, [p.id]: next }))}
                      // Capped at what the showcase actually holds — the server refuses more
                      // anyway, and letting the barista type it first only wastes their time.
                      max={available}
                      capHint={available === 0 ? 'Showcase kosong' : undefined}
                    />
                  </View>
                );
              })}
            </View>

            <MetaRow
              label="Total cups"
              value={<AnimatedNumber value={totalCups} suffix=" cups" variant="h3" color={brand[700]} />}
              emphasis
            />

            <Input
              label="Uang harian (Rp)"
              icon="cash"
              value={allowanceText}
              onChangeText={setAllowanceText}
              keyboardType="number-pad"
              hint={
                allowanceChanged
                  ? 'Diubah dari jumlah harian — tercatat sebagai penyesuaian.'
                  : 'Terisi otomatis setiap hari. Ubah hanya bila perlu.'
              }
            />

            {banner ? <Banner tone="danger" message={banner} /> : null}

            <Button
              label="Kirim ke Gerobak"
              icon="send"
              onPress={() => void submit()}
              loading={handToCart.isPending}
              disabled={!canSubmit}
              hint="Cups berpindah dari showcase ke gerobak, dan staff otomatis masuk penugasan hari ini"
            />
          </Card>
        </Animated.View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stateCard: { gap: space.md, alignItems: 'center' },
  card: { gap: space.md },
  pickList: { gap: space.sm },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: semantic.surfaceSunken,
  },
  pickRowActive: { backgroundColor: brand[50] },
  pickAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.surfaceSunken,
  },
  pickText: { flex: 1, gap: space.xxs },
  lines: { gap: space.md },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    borderRadius: radius.sm,
    padding: space.sm,
  },
  lineText: { flex: 1, gap: space.xxs },
});

import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Touchable } from '@/components/ui/Touchable';
import { MetaRow, SectionTitle } from '@/components/ui/Section';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { enter } from '@/components/ui/Motion';
import { useProducts } from '@/features/refill/queries';
import { useCarts, useCloseOutCart, useShowcaseStaff } from '@/features/showcase/queries';
import { ApiError } from '@/lib/api';
import { brand, feedback, pressScale, radius, semantic, space } from '@/theme';

/**
 * Tutup Gerobak — sorting what came back off a cart at the end of the day.
 *
 * Two buckets, because they mean different things to the numbers: cups going back into the
 * showcase get sold tomorrow, cups marked reject are gone. Both leave the cart either way, which
 * is what keeps the cart's stock honest overnight.
 *
 * The steppers are capped by what the cart actually holds, and the cap is enforced across BOTH
 * buckets together — 6 back plus 6 rejected out of 10 is not a thing that can have happened.
 */
export default function BaristaCloseOutScreen() {
  const cartsQuery = useCarts();
  const staffQuery = useShowcaseStaff();
  const productsQuery = useProducts();
  const closeOut = useCloseOutCart();

  const [cartId, setCartId] = useState<number | null>(null);
  const [returned, setReturned] = useState<Record<number, number>>({});
  const [rejected, setRejected] = useState<Record<number, number>>({});
  const [banner, setBanner] = useState<string | null>(null);

  const carts = useMemo(
    () => (cartsQuery.data ?? []).filter((cart) => cart.status === 'active'),
    [cartsQuery.data],
  );
  const products = useMemo(
    () => [...(productsQuery.data ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [productsQuery.data],
  );
  const staffList = staffQuery.data ?? [];

  /** Only carts that actually have someone on them today can be closed out. */
  const cartsOnShift = useMemo(
    () => carts.filter((cart) => staffList.some((s) => s.assigned_cart_id === cart.id)),
    [carts, staffList],
  );

  const staffOn = (id: number) => staffList.find((s) => s.assigned_cart_id === id)?.name ?? null;

  const totalReturned = Object.values(returned).reduce((sum, n) => sum + n, 0);
  const totalRejected = Object.values(rejected).reduce((sum, n) => sum + n, 0);
  const canSubmit = cartId !== null && totalReturned + totalRejected > 0;

  const reset = () => {
    setReturned({});
    setRejected({});
  };

  const submit = async () => {
    if (!canSubmit || cartId === null) return;
    setBanner(null);

    try {
      const result = await closeOut.mutateAsync({
        cartId,
        returned: products.map((p) => ({ product_id: p.id, qty: returned[p.id] ?? 0 })),
        rejected: products.map((p) => ({ product_id: p.id, qty: rejected[p.id] ?? 0 })),
      });

      reset();
      Alert.alert(
        'Tutup gerobak tercatat',
        `Gerobak ${result.cart_code}: ${totalReturned} cups masuk showcase, ${totalRejected} cups reject.`,
      );
    } catch (e) {
      setBanner(e instanceof ApiError ? e.message : 'Terjadi kesalahan tidak terduga.');
    }
  };

  const isLoading = cartsQuery.isLoading || productsQuery.isLoading || staffQuery.isLoading;

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList count={3} lines={1} />
      </Screen>
    );
  }

  const refresh = () => {
    void cartsQuery.refetch();
    void staffQuery.refetch();
  };

  return (
    <Screen refreshing={cartsQuery.isRefetching || staffQuery.isRefetching} onRefresh={refresh}>
      <Text variant="h2">Tutup Gerobak</Text>
      <Text variant="caption" color={semantic.textMuted}>
        Catat sisa cups: masuk showcase untuk dijual besok, atau reject.
      </Text>

      <SectionTitle
        title="Pilih gerobak"
        caption={`${cartsOnShift.length} gerobak bertugas hari ini`}
        icon="moped-outline"
      />
      <Card style={styles.card}>
        {cartsOnShift.length === 0 ? (
          <EmptyState
            icon="moped-outline"
            title="Belum ada gerobak bertugas"
            subtitle="Gerobak masuk daftar ini setelah menerima stock hari ini."
            tone="neutral"
          />
        ) : (
          <View style={styles.pickList}>
            {cartsOnShift.map((cart, index) => {
              const active = cart.id === cartId;
              return (
                <Animated.View key={cart.id} entering={enter('below', index, 8)}>
                  <Touchable
                    onPress={() => {
                      setCartId(cart.id);
                      reset();
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
                        {staffOn(cart.id) ?? 'Tanpa staff'}
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

      {cartId !== null ? (
        <Animated.View entering={enter('below')}>
          <SectionTitle title="Masuk showcase" caption="Dijual lagi besok" icon="fridge-outline" />
          <Card style={styles.card}>
            <View style={styles.lines}>
              {products.map((p) => (
                <View key={p.id} style={styles.lineRow}>
                  <Text variant="body" style={styles.lineText} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <QtyStepper
                    value={returned[p.id] ?? 0}
                    onChange={(next) => setReturned((prev) => ({ ...prev, [p.id]: next }))}
                    max={9999}
                  />
                </View>
              ))}
            </View>
            <MetaRow
              label="Total masuk showcase"
              value={<AnimatedNumber value={totalReturned} suffix=" cups" variant="h3" color={brand[700]} />}
              emphasis
            />
          </Card>

          <SectionTitle title="Reject" caption="Tidak layak jual — dihapus dari stok" icon="delete-outline" />
          <Card style={styles.card}>
            <View style={styles.lines}>
              {products.map((p) => (
                <View key={p.id} style={styles.lineRow}>
                  <Text variant="body" style={styles.lineText} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <QtyStepper
                    value={rejected[p.id] ?? 0}
                    onChange={(next) => setRejected((prev) => ({ ...prev, [p.id]: next }))}
                    max={9999}
                  />
                </View>
              ))}
            </View>
            <MetaRow
              label="Total reject"
              value={
                <AnimatedNumber value={totalRejected} suffix=" cups" variant="h3" color={feedback.dangerFg} />
              }
              emphasis
            />
          </Card>

          {banner ? <Banner tone="danger" message={banner} /> : null}

          <Card style={styles.card}>
            <Banner
              tone="info"
              message="Server menolak bila total sisa + reject melebihi stok gerobak — angka gerobak tidak bisa jadi minus."
            />
            <Button
              label="Simpan Tutup Gerobak"
              icon="content-save-outline"
              onPress={() => void submit()}
              loading={closeOut.isPending}
              disabled={!canSubmit}
            />
          </Card>
        </Animated.View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  lines: { gap: space.sm },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    borderRadius: radius.sm,
    padding: space.sm,
  },
  lineText: { flex: 1 },
});

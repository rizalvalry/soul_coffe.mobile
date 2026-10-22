import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';

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
import { useCarts, useCloseOutCart, useCloseOutDraft } from '@/features/showcase/queries';
import { useKitchenSelection } from '@/features/showcase/kitchenSelection';
import { useAuth } from '@/features/auth/store';
import { ApiError, request } from '@/lib/api';
import { brand, feedback, pressScale, radius, semantic, space } from '@/theme';

/**
 * Tutup Coffee Bike — sorting what came back off a cart at the end of the day.
 *
 * Two buckets, because they mean different things to the numbers: cups going back into the
 * showcase get sold tomorrow, cups marked reject are gone. Both leave the cart either way, which
 * is what keeps the cart's stock honest overnight.
 *
 * The steppers are capped by what the cart actually holds, and the cap is enforced across BOTH
 * buckets together — 6 back plus 6 rejected out of 10 is not a thing that can have happened.
 */
type Kitchen = { id: number; name: string };

export default function CloseOutScreen() {
  const user = useAuth((s) => s.session?.user);
  const isBarista = user?.role === 'BARISTA';
  const { kitchenId, loaded, load, select } = useKitchenSelection();
  const kitchensQuery = useQuery({ queryKey: ['showcase', 'kitchens'],
    queryFn: () => request<Kitchen[]>('/showcase/kitchens'), enabled: !isBarista });
  const selectedKitchen = kitchensQuery.data?.find((kitchen) => kitchen.id === kitchenId);
  const kitchenReady = isBarista || (loaded && selectedKitchen !== undefined);
  const cartsQuery = useCarts(kitchenReady, 'close-out');
  const productsQuery = useProducts();
  const closeOut = useCloseOutCart();

  const [cartId, setCartId] = useState<number | null>(null);
  const closingDraft = useCloseOutDraft(cartId);
  const [returned, setReturned] = useState<Record<number, number>>({});
  const [rejected, setRejected] = useState<Record<number, number>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => { if (!isBarista) void load(); }, [isBarista, load]);
  useEffect(() => {
    if (!loaded || !kitchensQuery.data || isBarista) return;
    if (kitchensQuery.data.length === 1 && kitchenId !== kitchensQuery.data[0]?.id) {
      void select(kitchensQuery.data[0]!.id);
    } else if (kitchenId !== null && !selectedKitchen) {
      void select(null);
    }
  }, [loaded, kitchensQuery.data, kitchenId, selectedKitchen, isBarista, select]);
  useEffect(() => { setCartId(null); }, [kitchenId]);

  const chooseKitchen = async (id: number) => {
    setSelectionError(null);
    try { await select(id); } catch { setSelectionError('Pilihan dapur belum bisa disimpan di HP. Coba lagi ya.'); }
  };

  useEffect(() => {
    if (!closingDraft.data) return;
    setReturned(Object.fromEntries(closingDraft.data.lines.map((line) => [line.product_id, line.qty_to_return])));
  }, [closingDraft.data]);

  const carts = useMemo(
    () => (cartsQuery.data ?? []).filter((cart) => cart.status === 'active'),
    [cartsQuery.data],
  );
  const products = useMemo(
    () => [...(productsQuery.data ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [productsQuery.data],
  );

  const totalReturned = Object.values(returned).reduce((sum, n) => sum + n, 0);
  const totalRejected = Object.values(rejected).reduce((sum, n) => sum + n, 0);
  const canSubmit = cartId !== null && productsQuery.isSuccess && products.length > 0
    && closingDraft.isSuccess && (totalReturned + totalRejected > 0 || !!closingDraft.data?.closing_id);

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
        'Tutup Coffee Bike tercatat',
        `Coffee Bike ${result.cart_code}: ${totalReturned} cups masuk showcase, ${totalRejected} cups reject.`,
      );
    } catch (e) {
      setBanner(e instanceof ApiError ? e.message : 'Tutup Coffee Bike belum tersimpan. Coba lagi ya.');
    }
  };

  const isLoading = kitchenReady && (cartsQuery.isLoading || productsQuery.isLoading);

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList count={3} lines={1} />
      </Screen>
    );
  }

  const refresh = () => {
    void cartsQuery.refetch();
    if (!isBarista) void kitchensQuery.refetch();
  };

  if (!kitchenReady) {
    return (
      <Screen>
        <Text variant="h2">Tutup Coffee Bike</Text>
        <Text variant="caption">Pilih dapur tempat Coffee Bike kembali hari ini.</Text>
        {kitchensQuery.isError ? <Banner tone="danger" message="Daftar dapur belum bisa dimuat. Coba lagi ya." /> : null}
        {selectionError ? <Banner tone="danger" message={selectionError} /> : null}
        {kitchensQuery.isError ? <Button label="Coba lagi" onPress={() => void kitchensQuery.refetch()} /> : null}
        {loaded && kitchensQuery.data?.map((kitchen) => (
          <Card key={kitchen.id} style={{ gap: space.sm }}>
            <Text variant="bodyStrong">{kitchen.name}</Text>
            <Button label="Pakai dapur ini" onPress={() => void chooseKitchen(kitchen.id)} disabled={closeOut.isPending} />
          </Card>
        ))}
        {kitchensQuery.data?.length === 0 ? <Banner tone="warning" message="Belum ada Dapur Pusat yang aktif." /> : null}
      </Screen>
    );
  }

  return (
    <Screen refreshing={cartsQuery.isRefetching || kitchensQuery.isRefetching} onRefresh={refresh}>
      <Text variant="h2">Tutup Coffee Bike</Text>
      <Text variant="caption" color={semantic.textMuted}>
        {selectedKitchen ? `${selectedKitchen.name} · ` : ''}Catat sisa cups: masuk showcase untuk dijual besok, atau reject.
      </Text>
      {!isBarista && (kitchensQuery.data?.length ?? 0) > 1 ? (
        <Button label="Ganti dapur" variant="secondary" disabled={closeOut.isPending} onPress={() => void select(null)} />
      ) : null}

      <SectionTitle
        title="Pilih Coffee Bike"
        caption={`${carts.length} Coffee Bike aktif di dapur ini`}
        icon="moped-outline"
      />
      {productsQuery.isError ? (
        <Card style={styles.card}>
          <Banner tone="danger" message="Daftar produk belum bisa dimuat. Coba lagi ya sebelum hitung sisa." />
          <Button label="Coba lagi" onPress={() => void productsQuery.refetch()} />
        </Card>
      ) : null}
      {productsQuery.isSuccess && products.length === 0 ? (
        <Banner tone="warning" message="Belum ada produk yang bisa dihitung. Hubungi Finance dulu ya." />
      ) : null}
      {cartId !== null && closingDraft.isError ? (
        <Card style={styles.card}>
          <Banner tone="danger" message="Data Closing Rider belum bisa dimuat. Coba lagi ya." />
          <Button label="Coba lagi" onPress={() => void closingDraft.refetch()} />
        </Card>
      ) : null}
      <Card style={styles.card}>
        {carts.length === 0 ? (
          <EmptyState
            icon="moped-outline"
            title="Belum ada Coffee Bike aktif"
            subtitle="Cek pilihan dapur atau coba lagi sebentar ya."
            tone="neutral"
          />
        ) : (
          <View style={styles.pickList}>
            {carts.map((cart, index) => {
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
                    accessibilityLabel={`Pilih Coffee Bike ${cart.code}`}
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
                      <Text variant="bodyStrong">Coffee Bike {cart.code}</Text>
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
          {closingDraft.data?.closing_id ? (
            <Banner tone="info" message="Sisa dari Closing Rider sudah terisi. Kalau hitungan Runner beda, selisihnya tetap dicatat dan terlihat di Finance ya." />
          ) : <Banner tone="warning" message="Rider belum Closing. Hitung sisa Coffee Bike dulu ya; Finance masih menunggu Closing Rider." />}
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
            {closingDraft.data?.lines.some((line) =>
              (returned[line.product_id] ?? 0) + (rejected[line.product_id] ?? 0) !== line.qty_remaining) ? (
                <Banner tone="warning" message="Hitungan Runner beda dari Closing Rider. Selisih akan ditandai, bukan ditolak." />
              ) : null}
            <Banner
              tone="info"
              message="Sisa + reject nggak boleh lebih dari stok Coffee Bike, ya."
            />
            <Button
              label="Simpan Tutup Coffee Bike"
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

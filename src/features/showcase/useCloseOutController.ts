import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useProducts } from '@/features/refill/queries';
import { useCarts, useCloseOutCart, useCloseOutDraft } from '@/features/showcase/queries';
import { useKitchenSelection } from '@/features/showcase/kitchenSelection';
import { useAuth } from '@/features/auth/store';
import { ApiError, request } from '@/lib/api';

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

export function useCloseOutController() {
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
  const hasDifference = closingDraft.data?.lines.some((line) =>
    (returned[line.product_id] ?? 0) + (rejected[line.product_id] ?? 0) !== line.qty_remaining);

  const reset = () => {
    setReturned({});
    setRejected({});
  };
  const chooseCart = (id: number) => {
    setCartId(id);
    reset();
    setBanner(null);
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

  const refresh = () => {
    void cartsQuery.refetch();
    if (!isBarista) void kitchensQuery.refetch();
  };

  return { isBarista, loaded, select, kitchensQuery, selectedKitchen, kitchenReady, cartsQuery,
    productsQuery, closeOut, cartId, closingDraft, returned, setReturned, rejected,
    setRejected, banner, selectionError, chooseKitchen, carts, products, totalReturned,
    totalRejected, canSubmit, hasDifference, chooseCart, submit, isLoading, refresh };
}

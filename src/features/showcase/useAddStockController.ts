import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useProducts } from '@/features/refill/queries';
import { useCartAllowance, useCarts, useHandToCart, useHandoverHistory,
  useShowcaseStaff, useShowcaseStock } from '@/features/showcase/queries';
import { MAX_PRODUCTION_QTY } from '@/features/showcase/quantity';
import { ApiError } from '@/lib/api';

export function useAddStockController() {
  const cartsQuery = useCarts();
  const staffQuery = useShowcaseStaff();
  const productsQuery = useProducts();
  const showcaseQuery = useShowcaseStock();
  const handToCart = useHandToCart();
  const handovers = useHandoverHistory();

  const [cartId, setCartId] = useState<number | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [qtyByProduct, setQtyByProduct] = useState<Record<number, number>>({});
  const [allowanceText, setAllowanceText] = useState('');
  const [note, setNote] = useState('');
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

  const canSubmit =
    cartId !== null &&
    staffId !== null &&
    totalCups > 0 &&
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
        note: note.trim(),
        // Only sent when the barista actually moved it — submitting the pre-filled value
        // unchanged should not read as a deliberate override in the audit trail.
        ...(allowanceChanged ? { allowanceAmount } : {}),
      });

      setQtyByProduct({});
      setNote('');
      Alert.alert(
        'Stock terkirim',
        `${totalCups} cups masuk ke Coffee Bike ${result.cart_code} untuk ${result.staff_name}. ` +
          'Stok Coffee Bike di aplikasi rider sudah ikut ter-update.',
      );
    } catch (e) {
      setBanner(e instanceof ApiError ? e.message : 'Terjadi kesalahan tidak terduga.');
    }
  };

  const isLoading =
    cartsQuery.isLoading || staffQuery.isLoading || productsQuery.isLoading || showcaseQuery.isLoading;
  const isError = cartsQuery.isError || staffQuery.isError || productsQuery.isError;
  const refreshing =
    cartsQuery.isRefetching || staffQuery.isRefetching || showcaseQuery.isRefetching;
  const refresh = () => {
    void cartsQuery.refetch();
    void staffQuery.refetch();
    void showcaseQuery.refetch();
  };
  const retry = () => {
    void cartsQuery.refetch();
    void staffQuery.refetch();
    void productsQuery.refetch();
    void showcaseQuery.refetch();
  };
  const chooseCart = (id: number) => { setCartId(id); setBanner(null); };
  const chooseStaff = (id: number) => { setStaffId(id); setBanner(null); };
  const setProductQty = (productId: number, next: number) =>
    setQtyByProduct((prev) => ({ ...prev, [productId]: next }));
  const maxForProduct = (available: number) => Math.min(available, MAX_PRODUCTION_QTY);

  return { cartsQuery, staffQuery, productsQuery, showcaseQuery, handToCart, handovers,
    cartId, staffId, qtyByProduct, setQtyByProduct, allowanceText, setAllowanceText,
    note, setNote, banner, carts, staffList, products, availableByProduct,
    selectedStaff, totalCups, allowanceChanged, canSubmit, submit, isLoading,
    isError, refreshing, refresh, retry, chooseCart, chooseStaff, setProductQty, maxForProduct };
}

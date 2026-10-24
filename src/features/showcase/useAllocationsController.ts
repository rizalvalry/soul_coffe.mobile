import { useState } from 'react';
import { useKitchenStock, useProducts, useStaffOnShift } from '@/features/refill/queries';
import { useLocations } from '@/features/riderLocation/queries';
import { useCreateAllocation } from '@/features/showcase/queries';
import { MAX_PRODUCTION_QTY } from '@/features/showcase/quantity';
import { ApiError } from '@/lib/api';

function todayLocal(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function useAllocationsController() {
  const roster = useStaffOnShift();
  const products = useProducts();
  const kitchenStock = useKitchenStock();
  const locations = useLocations();
  const create = useCreateAllocation();
  const [staffId, setStaffId] = useState<number | null>(null);
  const [fallbackLocationId, setFallbackLocationId] = useState<number | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const maxForProduct = (productId: number) => kitchenStock.data === undefined ? MAX_PRODUCTION_QTY : Math.min(
    Math.max(0, kitchenStock.data.find((row) => row.product_id === productId)?.on_hand ?? 0),
    MAX_PRODUCTION_QTY,
  );
  const stockShortages = Object.entries(qty).flatMap(([productId, amount]) => {
    const available = maxForProduct(Number(productId));
    if (amount <= available) return [];
    const productName = products.data?.find((product) => product.id === Number(productId))?.name ?? 'Produk';
    return [`${productName}: dipilih ${amount}, stok dapur ${available} cups`];
  });
  const selected = roster.data?.find((row) => row.staff_id === staffId);
  const locationId = selected?.location_id ?? fallbackLocationId;
  const lines = Object.entries(qty).filter(([, amount]) => amount > 0)
    .map(([productId, amount]) => ({ product_id: Number(productId), qty_issued: amount }));
  const selectStaff = (id: number) => { setStaffId(id); setQty({}); setFallbackLocationId(null); };
  const setProductQty = (productId: number, amount: number) =>
    setQty((old) => ({ ...old, [productId]: amount }));

  const submit = async () => {
    if (!selected || !locationId) return;
    setMessage(null);
    try {
      await create.mutateAsync({ operatingDate: todayLocal(), cartId: selected.cart_id,
        staffId: selected.staff_id, locationId, lines,
        ...(selected.has_allocation ? { correctionReason: reason.trim() } : {}) });
      setQty({});
      setReason('');
      setMessage('Alokasi tambahan sudah tercatat.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Alokasi belum berhasil. Coba lagi ya.');
    }
  };

  return { roster, products, kitchenStock, locations, create, staffId, selectStaff,
    fallbackLocationId, setFallbackLocationId, qty, setProductQty, reason, setReason,
    message, maxForProduct, stockShortages, selected, locationId, lines, submit };
}

import { useState } from 'react';
import { useProducts } from '@/features/refill/queries';
import { useBrewIntoShowcase } from '@/features/showcase/queries';
import { MAX_PRODUCTION_QTY } from '@/features/showcase/quantity';
import { ApiError } from '@/lib/api';

export function useBrewController() {
  const products = useProducts();
  const brew = useBrewIntoShowcase();
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const lines = Object.entries(quantities).filter(([, qty]) => qty > 0)
    .map(([productId, qty]) => ({ product_id: Number(productId), qty }));
  const setProductQty = (productId: number, qty: number) =>
    setQuantities((old) => ({ ...old, [productId]: qty }));

  const submit = async () => {
    setMessage(null);
    try {
      await brew.mutateAsync({ lines });
      setQuantities({});
      setMessage('Brew sudah tercatat dan stok dapur bertambah.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Brew belum berhasil. Coba lagi ya.');
    }
  };

  return { products, brew, quantities, setProductQty, maxQty: MAX_PRODUCTION_QTY,
    message, lines, submit };
}

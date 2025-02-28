'use client';

import { track } from '@vercel/analytics';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { addToCart } from '@/utils/actions';
import { useProductDetailPageContext } from '@/utils/product-detail-page';

export function AddToCartButton() {
  const { color, size } = useProductDetailPageContext();
  const router = useRouter();

  useEffect(() => {
    track('add_to_cart:viewed');
  }, []);

  const handleAddToCart = async () => {
    track('add_to_cart:clicked');
    await addToCart({ color, size });
    router.push('/cart');
  };

  return (
    <button
      type="button"
      className="cursor-pointer mt-8 flex w-full items-center justify-center rounded-full border border-transparent bg-blue-600 px-8 py-3 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      onClick={handleAddToCart}
    >
      Add to cart
    </button>
  );
}

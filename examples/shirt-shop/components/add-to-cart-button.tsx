'use client';

import { track } from '@vercel/analytics';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addToCart } from '@/utils/actions';
import { useProductDetailPageContext } from '@/utils/product-detail-page';

function Spinner() {
  return (
    <div className="inline-block size-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
  );
}

export function AddToCartButton() {
  const { color, size } = useProductDetailPageContext();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    track('add_to_cart:viewed');
  }, []);

  const handleAddToCart = async () => {
    setIsLoading(true);
    track('add_to_cart:clicked');
    await addToCart({ color, size });
    router.push('/cart');
  };

  return (
    <button
      type="button"
      className="cursor-pointer mt-8 flex w-full items-center justify-center gap-2 rounded-full border border-transparent bg-blue-600 px-8 py-3 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-blue-700"
      onClick={handleAddToCart}
      disabled={isLoading}
    >
      {isLoading ? <Spinner /> : null}
      Add to cart
    </button>
  );
}

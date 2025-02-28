'use client';

import { track } from '@vercel/analytics';
import { useEffect } from 'react';

export function AddToCartButton() {
  useEffect(() => {
    track('add_to_cart:viewed');
  }, []);

  return (
    <button
      type="button"
      className="mt-8 flex w-full items-center justify-center rounded-full border border-transparent bg-blue-600 px-8 py-3 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      onClick={() => track('add_to_cart:clicked')}
    >
      Add to cart
    </button>
  );
}

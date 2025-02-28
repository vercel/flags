'use client';

import { removeFromCart } from '@/utils/actions';

export function OrderSummaryRemoveButton({ index }: { index: number }) {
  return (
    <button
      type="button"
      onClick={() => removeFromCart(index)}
      className="cursor-pointer font-medium text-blue-600 hover:text-blue-500"
    >
      Remove
    </button>
  );
}

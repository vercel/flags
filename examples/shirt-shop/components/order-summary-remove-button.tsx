'use client';

import { removeFromCart } from '@/app/actions';

export function OrderSummaryRemoveButton({ index }: { index: number }) {
  return (
    <button
      type="button"
      onClick={() => removeFromCart(index)}
      className="font-medium text-blue-600 hover:text-blue-500"
    >
      Remove
    </button>
  );
}

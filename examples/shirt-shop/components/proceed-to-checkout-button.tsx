'use client';

import { track } from '@vercel/analytics';
import { toast } from 'sonner';

export function ProceedToCheckoutButton({ color }: { color: string }) {
  return (
    <button
      type="button"
      className={`${color} cursor-pointer w-full rounded-full border border-transparent px-4 py-3 text-base font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-50`}
      onClick={() => {
        track('proceed_to_checkout:clicked');
        toast('End reached', {
          className: 'my-classname',
          description: 'The checkout flow is not implemented in this template.',
          duration: 5000,
        });
      }}
    >
      Proceed to Checkout
    </button>
  );
}

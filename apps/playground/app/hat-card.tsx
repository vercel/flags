'use client';

import { addToCart } from './actions';

export function HatCard({
  hat,
  inCart,
}: {
  hat: { id: string; name: string; price: number; emoji: string };
  inCart: boolean;
}) {
  return (
    <button
      type="button"
      disabled={inCart}
      onClick={async () => {
        await addToCart(hat.id);
      }}
      className="flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-white p-6 text-center shadow-sm transition-all hover:shadow-md hover:border-amber-400 disabled:opacity-60 disabled:cursor-default disabled:hover:shadow-sm disabled:hover:border-amber-200 dark:border-amber-800 dark:bg-zinc-900 dark:hover:border-amber-600"
    >
      <span className="text-5xl">{hat.emoji}</span>
      <span className="text-lg font-semibold text-amber-900 dark:text-amber-100">
        {hat.name}
      </span>
      <span className="text-amber-700 dark:text-amber-300">
        ${hat.price.toFixed(2)}
      </span>
      <span className="mt-1 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
        {inCart ? 'In Cart' : 'Add to Cart'}
      </span>
    </button>
  );
}

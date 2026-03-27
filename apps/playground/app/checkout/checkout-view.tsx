'use client';

import Link from 'next/link';
import { useState } from 'react';
import { checkout } from '../actions';
import { HatIcon } from '../hat';

export function CheckoutView({
  items,
  total,
}: {
  items: { id: string; name: string; price: number; color: string }[];
  total: number;
}) {
  const [purchased, setPurchased] = useState(false);

  if (purchased) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-amber-50 font-sans dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4 text-center">
          <HatIcon className="w-28 h-auto" style={{ color: '#8B4513' }} />
          <h1 className="text-3xl font-bold text-amber-900 dark:text-amber-100">
            Order Confirmed!
          </h1>
          <p className="text-lg text-amber-700 dark:text-amber-300">
            Your {items.length === 1 ? 'hat is' : 'hats are'} on the way,
            partner.
          </p>
          <Link
            href="/"
            className="mt-4 rounded-full bg-amber-800 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-900 dark:bg-amber-600 dark:hover:bg-amber-700"
          >
            Back to Shop
          </Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-amber-50 font-sans dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg text-amber-700 dark:text-amber-300">
            Your cart is empty.
          </p>
          <Link
            href="/"
            className="rounded-full bg-amber-800 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-900 dark:bg-amber-600 dark:hover:bg-amber-700"
          >
            Browse Hats
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-amber-50 font-sans dark:bg-zinc-950">
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-8 py-16 px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-amber-900 dark:text-amber-100">
            Checkout
          </h1>
          <Link
            href="/"
            className="text-sm text-amber-700 underline hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
          >
            Continue Shopping
          </Link>
        </div>
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-amber-200 bg-white p-4 dark:border-amber-800 dark:bg-zinc-900"
            >
              <div className="flex items-center gap-3">
                <HatIcon
                  className="w-10 h-auto"
                  style={{ color: item.color }}
                />
                <span className="font-medium text-amber-900 dark:text-amber-100">
                  {item.name}
                </span>
              </div>
              <span className="text-amber-700 dark:text-amber-300">
                ${item.price.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-amber-200 pt-4 dark:border-amber-800">
          <span className="text-lg font-semibold text-amber-900 dark:text-amber-100">
            Total
          </span>
          <span className="text-lg font-semibold text-amber-900 dark:text-amber-100">
            ${total.toFixed(2)}
          </span>
        </div>
        <button
          type="button"
          onClick={async () => {
            await checkout();
            setPurchased(true);
          }}
          className="w-full rounded-full bg-amber-800 py-3 text-lg font-semibold text-white transition-colors hover:bg-amber-900 dark:bg-amber-600 dark:hover:bg-amber-700"
        >
          Complete Purchase
        </button>
      </main>
    </div>
  );
}

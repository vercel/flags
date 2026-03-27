'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CheckoutExperiment, Entity, ShopProduct } from '@/types';
import { HatIcon } from '../hat';
import { CompletePurchase } from './complete-purchase';

export function CheckoutView({
  items,
  total,
  experiment,
  identity,
}: {
  items: ShopProduct[];
  total: number;
  experiment: CheckoutExperiment;
  identity: Entity;
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
    <CompletePurchase
      items={items}
      total={total}
      identity={identity}
      setPurchased={setPurchased}
      experiment={experiment}
    />
  );
}

import { track } from '@vercel/analytics/react';
import Link from 'next/link';
import type { CheckoutExperiment, Entity } from '@/types';
import { checkout } from '../actions';
import { HatIcon } from '../hat';
import { useExperiment } from './hook';

export function CompletePurchase({
  items,
  total,
  setPurchased,
  identity,
  experiment,
}: {
  items: { id: string; name: string; price: number; color: string }[];
  total: number;
  setPurchased: (v: boolean) => void;
  identity: Entity;
  experiment: CheckoutExperiment;
}) {
  const { displayFreeShippingLabel } = useExperiment(experiment, identity);
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
            track('completed-purchase', {
              visitorId: identity.visitor.id,
            });
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

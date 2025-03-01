import { ShoppingBagIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import Image from 'next/image';
import { colorToImage } from '@/utils/images';
import { ShoppingCartRemoveButton } from './shopping-cart-remove-button';
import { getCart } from '@/utils/actions';
import { Suspense } from 'react';

function ShoppingCartContentFallback() {
  return (
    <ul role="list" className="-my-6 divide-y divide-gray-200">
      <li className="flex py-6 animate-pulse">
        <div className="flex-shrink-0 size-24 overflow-hidden rounded-md border border-gray-200 bg-gray-200" />
        <div className="ml-4 flex flex-1 flex-col">
          <div>
            <div className="flex justify-between text-base font-medium text-gray-900">
              <div className="h-5 w-24 bg-gray-200 rounded mt-1" />
              <div className="ml-4 h-5 w-20 bg-gray-200 rounded mt-1" />
            </div>
            <div className="mt-1 h-4 w-32 bg-gray-200 rounded" />
          </div>
          <div className="flex flex-1 items-end justify-between text-sm mt-4">
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <div className="h-4 w-14 bg-gray-200 rounded" />
          </div>
        </div>
      </li>
    </ul>
  );
}

async function ShoppingCartContent() {
  const { items } = await getCart();
  return (
    <ul role="list" className="-my-6 divide-y divide-gray-200">
      {items.length === 0 ? (
        <li className="py-6 text-center text-gray-500">
          Your cart is empty.{' '}
          <Link href="/" className="text-blue-600 hover:text-blue-500">
            Continue shopping
          </Link>
        </li>
      ) : (
        items.map((item, index) => (
          <li key={index} className="flex py-6">
            <div className="flex-shrink-0 size-24 overflow-hidden rounded-md border border-gray-200">
              {colorToImage[item.color] ? (
                <Image
                  src={colorToImage[item.color]}
                  alt={`${item.color} T-Shirt`}
                  className="h-full w-full object-cover object-center"
                />
              ) : (
                <div className="h-full w-full bg-gray-200 flex items-center justify-center">
                  <ShoppingBagIcon className="h-8 w-8 text-gray-400" />
                </div>
              )}
            </div>

            <div className="ml-4 flex flex-1 flex-col">
              <div>
                <div className="flex justify-between text-base font-medium text-gray-900">
                  <h3>Circles T-Shirt</h3>
                  <p className="ml-4">20.00 USD</p>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {item.color}, {item.size}
                </p>
              </div>
              <div className="flex flex-1 items-end justify-between text-sm">
                <p className="text-gray-500">Qty {item.quantity}</p>
                <div className="flex">
                  <ShoppingCartRemoveButton index={index} />
                </div>
              </div>
            </div>
          </li>
        ))
      )}
    </ul>
  );
}

export function ShoppingCart() {
  return (
    <section className="lg:col-span-7">
      <div className="mx-auto max-w-2xl px-0 lg:max-w-none">
        <h1 className="text-xl font-medium text-gray-900 mb-8">
          Shopping Cart
        </h1>

        <div className="border-t border-gray-200 pt-8">
          <div className="flow-root">
            <Suspense fallback={<ShoppingCartContentFallback />}>
              <ShoppingCartContent />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}

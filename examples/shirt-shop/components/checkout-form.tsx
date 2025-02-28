import { proceedToCheckoutColorFlag } from '@/flags';
import Link from 'next/link';
import { ProceedToCheckoutButton } from './proceed-to-checkout-button';

const colorMap: Record<string, string> = {
  blue: 'bg-blue-600 hover:bg-blue-700',
  red: 'bg-red-600 hover:bg-red-700',
  green: 'bg-green-600 hover:bg-green-700',
};

export async function CheckoutForm({
  subtotal,
  shipping,
  total,
}: {
  subtotal: number;
  shipping: number;
  total: number;
}) {
  const proceedToCheckoutColor = await proceedToCheckoutColorFlag();

  return (
    <section className="mt-16 rounded-lg bg-gray-50 px-6 py-6 sm:p-6 lg:col-span-5 lg:mt-0 lg:p-8">
      <h2 className="text-lg font-medium text-gray-900">Order summary</h2>

      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">Subtotal</p>
          <p className="text-sm font-medium text-gray-900">
            {subtotal.toFixed(2)} USD
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-600">Shipping estimate</p>
          <p className="text-sm font-medium text-gray-900">
            {shipping.toFixed(2)} USD
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <p className="text-base font-medium text-gray-900">Order total</p>
          <p className="text-base font-medium text-gray-900">
            {total.toFixed(2)} USD
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ProceedToCheckoutButton color={colorMap[proceedToCheckoutColor]} />
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        <p>
          or{' '}
          <Link
            href="/"
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Continue Shopping
          </Link>
        </p>
      </div>
    </section>
  );
}

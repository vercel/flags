import Link from 'next/link';

export function CheckoutForm({
  subtotal,
  shipping,
  total,
}: {
  subtotal: number;
  shipping: number;
  total: number;
}) {
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
        <button
          type="button"
          className="w-full rounded-full border border-transparent bg-blue-600 px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-50"
        >
          Proceed to Checkout
        </button>
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

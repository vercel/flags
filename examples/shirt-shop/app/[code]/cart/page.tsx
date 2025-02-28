import { ShoppingBagIcon } from '@heroicons/react/24/outline';

export default function CartPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 sm:px-6 sm:pb-24 lg:max-w-7xl lg:px-8">
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-12 xl:gap-x-16">
        {/* Order summary */}
        <section className="lg:col-span-7">
          <div className="mx-auto max-w-2xl px-0 lg:max-w-none">
            <h1 className="text-xl font-medium text-gray-900 mb-8">
              Shopping Cart
            </h1>

            <div className="border-t border-gray-200 pt-8">
              <div className="flow-root">
                <ul role="list" className="-my-6 divide-y divide-gray-200">
                  <li className="flex py-6">
                    <div className="flex-shrink-0 size-24 overflow-hidden rounded-md border border-gray-200">
                      <div className="h-full w-full bg-gray-200 flex items-center justify-center">
                        <ShoppingBagIcon className="h-8 w-8 text-gray-400" />
                      </div>
                    </div>

                    <div className="ml-4 flex flex-1 flex-col">
                      <div>
                        <div className="flex justify-between text-base font-medium text-gray-900">
                          <h3>Circles T-Shirt</h3>
                          <p className="ml-4">20.00 USD</p>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">Black</p>
                      </div>
                      <div className="flex flex-1 items-end justify-between text-sm">
                        <p className="text-gray-500">Qty 1</p>
                        <div className="flex">
                          <button
                            type="button"
                            className="font-medium text-blue-600 hover:text-blue-500"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Checkout form */}
        <section className="mt-16 rounded-lg bg-gray-50 px-6 py-6 sm:p-6 lg:col-span-5 lg:mt-0 lg:p-8">
          <h2 className="text-lg font-medium text-gray-900">Order summary</h2>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">Subtotal</p>
              <p className="text-sm font-medium text-gray-900">20.00 USD</p>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <p className="text-sm text-gray-600">Shipping estimate</p>
              <p className="text-sm font-medium text-gray-900">5.00 USD</p>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <p className="text-base font-medium text-gray-900">Order total</p>
              <p className="text-base font-medium text-gray-900">25.00 USD</p>
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
              <button
                type="button"
                className="font-medium text-blue-600 hover:text-blue-500"
              >
                Continue Shopping
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

import { getCart } from '@/app/actions';
import { CheckoutForm } from '@/components/checkout-form';
import { OrderSummary } from '@/components/order-summary';

export default async function CartPage() {
  const { items } = await getCart();
  const subtotal = items.length * 20; // Assuming $20 per shirt
  const shipping = 5;
  const total = subtotal + shipping;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 sm:px-6 sm:pb-24 lg:max-w-7xl lg:px-8">
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-12 xl:gap-x-16">
        <OrderSummary items={items} />
        <CheckoutForm subtotal={subtotal} shipping={shipping} total={total} />
      </div>
    </main>
  );
}

import { getCart } from '@/utils/actions';
import { CheckoutForm } from '@/components/checkout-form';
import { Main } from '@/components/main';
import { OrderSummary } from '@/components/order-summary';

export default async function CartPage() {
  const { items } = await getCart();
  const subtotal = items.length * 20; // Assuming $20 per shirt
  const shipping = 5;
  const total = subtotal + shipping;

  return (
    <Main>
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-12 xl:gap-x-16">
        <OrderSummary items={items} />
        <CheckoutForm subtotal={subtotal} shipping={shipping} total={total} />
      </div>
    </Main>
  );
}

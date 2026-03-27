import { cookies } from 'next/headers';
import { checkoutExperiment, identify } from '@/flags';
import { CheckoutView } from './checkout-view';

const hats: Record<string, { name: string; price: number; color: string }> = {
  'classic-cowboy': { name: 'Classic Cowboy', price: 59.99, color: '#8B4513' },
  'black-stallion': { name: 'Black Stallion', price: 79.99, color: '#1a1a1a' },
  'rodeo-king': { name: 'Rodeo King', price: 99.99, color: '#B8860B' },
  'desert-drifter': { name: 'Desert Drifter', price: 44.99, color: '#C2185B' },
  'ranch-hand': { name: 'Ranch Hand', price: 34.99, color: '#1565C0' },
  'silver-spur': { name: 'Silver Spur', price: 119.99, color: '#708090' },
};

export default async function CheckoutPage() {
  const cookieStore = await cookies();
  const cartCookie = cookieStore.get('cart');
  const cart: string[] = cartCookie?.value ? JSON.parse(cartCookie.value) : [];

  const identity = await identify();

  const checkout = await checkoutExperiment();

  const items = cart
    .map((id) => ({ id, ...hats[id] }))
    .filter((item) => item.name);
  const total = items.reduce((sum, item) => sum + item.price, 0);

  return (
    <CheckoutView
      items={items}
      total={total}
      experiment={checkout}
      identity={identity}
    />
  );
}

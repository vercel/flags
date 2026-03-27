import { cookies } from 'next/headers';
import { CheckoutView } from './checkout-view';

const hats: Record<string, { name: string; price: number; emoji: string }> = {
  'classic-cowboy': {
    name: 'Classic Cowboy',
    price: 59.99,
    emoji: '\u{1F920}',
  },
  'black-stallion': {
    name: 'Black Stallion',
    price: 79.99,
    emoji: '\u{1F3A9}',
  },
  'rodeo-king': { name: 'Rodeo King', price: 99.99, emoji: '\u{1F451}' },
  'desert-drifter': {
    name: 'Desert Drifter',
    price: 44.99,
    emoji: '\u2600\uFE0F',
  },
  'ranch-hand': { name: 'Ranch Hand', price: 34.99, emoji: '\u{1F33E}' },
  'silver-spur': { name: 'Silver Spur', price: 119.99, emoji: '\u2B50' },
};

export default async function CheckoutPage() {
  const cookieStore = await cookies();
  const cartCookie = cookieStore.get('cart');
  const cart: string[] = cartCookie?.value ? JSON.parse(cartCookie.value) : [];

  const items = cart
    .map((id) => ({ id, ...hats[id] }))
    .filter((item) => item.name);
  const total = items.reduce((sum, item) => sum + item.price, 0);

  return <CheckoutView items={items} total={total} />;
}

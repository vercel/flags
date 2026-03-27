import { cookies } from 'next/headers';
import Link from 'next/link';
import { HatCard } from './hat-card';

const hats = [
  {
    id: 'classic-cowboy',
    name: 'Classic Cowboy',
    price: 59.99,
    color: '#8B4513',
  },
  {
    id: 'black-stallion',
    name: 'Black Stallion',
    price: 79.99,
    color: '#1a1a1a',
  },
  { id: 'rodeo-king', name: 'Rodeo King', price: 99.99, color: '#B8860B' },
  {
    id: 'desert-drifter',
    name: 'Desert Drifter',
    price: 44.99,
    color: '#C2185B',
  },
  { id: 'ranch-hand', name: 'Ranch Hand', price: 34.99, color: '#1565C0' },
  { id: 'silver-spur', name: 'Silver Spur', price: 119.99, color: '#708090' },
];

export default async function Home() {
  const cookieStore = await cookies();
  const cartCookie = cookieStore.get('cart');
  const cart: string[] = cartCookie?.value ? JSON.parse(cartCookie.value) : [];

  return (
    <div className="flex flex-col flex-1 items-center bg-amber-50 font-sans dark:bg-zinc-950">
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-8 py-16 px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-amber-900 dark:text-amber-100">
              Cowboy Hat Shop
            </h1>
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              Find your perfect hat, partner.
            </p>
          </div>
          {cart.length > 0 && (
            <Link
              href="/checkout"
              className="flex items-center gap-2 rounded-full bg-amber-800 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-900 dark:bg-amber-600 dark:hover:bg-amber-700"
            >
              Cart ({cart.length})
            </Link>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hats.map((hat) => (
            <HatCard key={hat.id} hat={hat} inCart={cart.includes(hat.id)} />
          ))}
        </div>
      </main>
    </div>
  );
}

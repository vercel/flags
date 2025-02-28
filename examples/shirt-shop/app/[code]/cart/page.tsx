import { getServerCart } from '@/utils/cart';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { CartClient } from './client';

// Server Component for initial cart state
function CartServer() {
  const cookieStore = cookies();
  const cookieStr = cookieStore.toString();
  const cart = getServerCart(cookieStr);

  return <CartClient initialItems={cart.items} />;
}

// Default export is now the Server Component
export default function CartPage() {
  return (
    <Suspense>
      <CartServer />
    </Suspense>
  );
}

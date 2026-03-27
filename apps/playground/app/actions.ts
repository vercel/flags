'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function addToCart(hatId: string) {
  const cookieStore = await cookies();
  const cartCookie = cookieStore.get('cart');
  const cart: string[] = cartCookie?.value ? JSON.parse(cartCookie.value) : [];

  if (!cart.includes(hatId)) {
    cart.push(hatId);
    cookieStore.set('cart', JSON.stringify(cart), { path: '/' });
  }

  redirect('/checkout');
}

export async function checkout() {
  const cookieStore = await cookies();
  cookieStore.delete('cart');
}

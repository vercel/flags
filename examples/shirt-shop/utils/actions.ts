'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { Cart, CartItem } from '@/utils/cart-types';
import { delayFlag } from '@/flags';

export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getCart(): Promise<Cart> {
  const delayMs = await delayFlag();
  await delay(delayMs);
  const cookieStore = await cookies();

  const cartCookie = cookieStore.get('cart')?.value;
  if (!cartCookie) return { items: [] };

  const cartData = JSON.parse(decodeURIComponent(cartCookie));
  return cartData;
}

export async function addToCart(item: Omit<CartItem, 'quantity'>) {
  const cart = await getCart();

  const existingItemIndex = cart.items.findIndex(
    (i) => i.color === item.color && i.size === item.size,
  );

  if (existingItemIndex >= 0) {
    cart.items[existingItemIndex].quantity += 1;
  } else {
    cart.items.push({ ...item, quantity: 1 });
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: 'cart',
    value: JSON.stringify(cart),
    path: '/',
  });
  revalidatePath('/cart');
}

export async function removeFromCart(index: number) {
  const cart = await getCart();

  const cookieStore = await cookies();

  cart.items.splice(index, 1);
  cookieStore.set({
    name: 'cart',
    value: JSON.stringify(cart),
    path: '/',
  });
  revalidatePath('/cart');
}

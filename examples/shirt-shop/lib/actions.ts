'use server';

import { revalidatePath } from 'next/cache';
import { Cart, CartItem } from '@/components/utils/cart-types';
import { delayFlag } from '@/flags';
import { getCartId } from './get-cart-id';

const BACKEND_URL = process.env.BACKEND_URL;

export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getCart(): Promise<Cart> {
  const cartId = await getCartId();
  const delayMs = await delayFlag();
  await delay(delayMs);
  return fetch(`${BACKEND_URL}/api/cart/${cartId.value}`).then((res) =>
    res.json(),
  );
}

export async function addToCart(item: CartItem) {
  const cartId = await getCartId();
  await fetch(`${BACKEND_URL}/api/cart/${cartId.value}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  revalidatePath('/cart');
}

export async function removeFromCart(item: CartItem) {
  const cartId = await getCartId();
  await fetch(`${BACKEND_URL}/api/cart/${cartId.value}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  revalidatePath('/cart');
}

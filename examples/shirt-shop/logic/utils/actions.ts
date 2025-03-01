'use server';

import { revalidatePath } from 'next/cache';
import { Cart, CartItem } from '@/components/utils/cart-types';
import { delayFlag } from '@/flags';
import { getCartId } from './get-cart-id';

const CART_BASE_URL = process.env.CART_BASE_URL;

export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getCart(): Promise<Cart> {
  const cartId = await getCartId();
  const delayMs = await delayFlag();
  await delay(delayMs);
  return fetch(`${CART_BASE_URL}/api/${cartId.value}`).then((res) =>
    res.json(),
  );
}

export async function addToCart(item: CartItem) {
  const cartId = await getCartId();
  await fetch(`${CART_BASE_URL}/api/${cartId.value}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  revalidatePath('/cart');
}

export async function removeFromCart(item: CartItem) {
  const cartId = await getCartId();
  await fetch(`${CART_BASE_URL}/api/${cartId.value}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  revalidatePath('/cart');
}

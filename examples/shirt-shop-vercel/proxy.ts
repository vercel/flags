import { createClient } from '@vercel/flags-core';
import { precompute } from 'flags/next';
import { type NextRequest, NextResponse } from 'next/server';
import { productFlags } from '@/flags';
import { getCartId } from './lib/get-cart-id';
import { getStableId } from './lib/get-stable-id';

export const config = {
  matcher: ['/', '/cart'],
  // matcher: ['/', '/cart', '/debug'],
};

// const client = createClient(process.env.FLAGS as string);
export async function proxy(request: NextRequest) {
  // const url = new URL(request.url);
  // if (url.pathname === '/debug') {
  //   await client.initialize();
  //   const result = await client.evaluate('summer-sale');
  //   console.log('middleware evaluated', result);
  //   return;
  // }

  const stableId = await getStableId();
  const cartId = await getCartId();
  const code = await precompute(productFlags);

  // rewrites the request to the variant for this flag combination
  const nextUrl = new URL(
    `/${code}${request.nextUrl.pathname}${request.nextUrl.search}`,
    request.url,
  );

  // Add a header to the request to indicate that the stable id is generated,
  // as it will not be present on the cookie request header on the first-ever request.
  if (cartId.isFresh) {
    request.headers.set('x-generated-cart-id', cartId.value);
  }

  if (stableId.isFresh) {
    request.headers.set('x-generated-stable-id', stableId.value);
  }

  // response headers
  const headers = new Headers();
  headers.append('set-cookie', `stable-id=${stableId.value}`);
  headers.append('set-cookie', `cart-id=${cartId.value}`);
  return NextResponse.rewrite(nextUrl, { request, headers });
}

import { precompute } from '@flags-sdk/next/precompute';
import { type NextRequest, NextResponse } from 'next/server';
import { productFlags } from '@/product-flags';
import { getCartId } from './lib/get-cart-id';
import { getStableId } from './lib/get-stable-id';

export const config = {
  matcher: ['/', '/cart'],
};

export async function proxy(request: NextRequest) {
  const stableId = await getStableId();
  const cartId = await getCartId();

  // On the first request the stable id is not in the cookie yet, so it goes
  // to the flags through the evaluation context
  const code = await precompute(productFlags, {
    request,
    evaluationContext: { stableId: stableId.value },
  });

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

import { type NextRequest, NextResponse } from 'next/server';
import { precompute } from 'flags/next';
import { productFlags } from '@/flags';
import { getStableId } from './utils/get-stable-id';

export const config = {
  matcher: ['/', '/cart'],
};

export async function middleware(request: NextRequest) {
  const stableId = await getStableId();
  const code = await precompute(productFlags);

  // rewrites the request to the variant for this flag combination
  const nextUrl = new URL(
    `/${code}${request.nextUrl.pathname}${request.nextUrl.search}`,
    request.url,
  );

  // If the stable id is fresh, we need to set the cookie and rewrite the request
  if (stableId.isFresh) {
    // Add a header to the request to indicate that the stable id is generated,
    // as it will not be present on the cookie request header on the first-ever request.
    request.headers.set('x-generated-stable-id', stableId.value);
    return NextResponse.rewrite(nextUrl, {
      request,
      headers: { 'set-cookie': `stable-id=${stableId.value}` },
    });
  }

  return NextResponse.rewrite(nextUrl, { request });
}

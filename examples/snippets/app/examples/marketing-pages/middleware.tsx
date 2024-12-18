import { precompute } from '@vercel/flags/next';
import { type NextRequest, NextResponse } from 'next/server';
import { marketingFlags } from './flags';
import { getOrGenerateVisitorId } from './get-or-generate-visitor-id';

export async function marketingMiddleware(request: NextRequest) {
  // assign a cookie to the visitor
  const visitorId = await getOrGenerateVisitorId(request.cookies);

  // precompute the flags
  const code = await precompute(marketingFlags);

  // rewrite the page with the code and set the cookie
  return NextResponse.rewrite(
    new URL(`/examples/marketing-pages/${code}`, request.url),
    { headers: { 'Set-Cookie': `marketing-visitor-id=${visitorId}; Path=/` } },
  );
}

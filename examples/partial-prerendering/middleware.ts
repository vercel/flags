import { NextResponse, type NextRequest } from 'next/server';
import * as flags from '#/middleware-flags';
import { precompute } from '@vercel/flags/next';

// See "Matching Paths" below to learn more
export const config = {
  matcher: ['/'],
};

// an empty middleware
export async function middleware(request: NextRequest) {
  const code = await precompute(flags.precomputeFlags);

  return NextResponse.rewrite(new URL(`/${code}`, request.url), {
    request,
  });
}

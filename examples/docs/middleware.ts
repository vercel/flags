import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { marketingMiddleware } from './app/examples/marketing-pages/middleware';
import { featureFlagsInEdgeMiddleware } from './app/examples/feature-flags-in-edge-middleware/middleware';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/examples/marketing-pages') {
    return marketingMiddleware(request);
  }

  if (
    request.nextUrl.pathname === '/examples/feature-flags-in-edge-middleware'
  ) {
    return featureFlagsInEdgeMiddleware(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/examples/marketing-pages',
    '/examples/feature-flags-in-edge-middleware',
  ],
};

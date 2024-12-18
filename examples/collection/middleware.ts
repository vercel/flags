import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { marketingMiddleware } from './app/examples/marketing-pages/middleware';
import { overviewMiddleware } from './app/getting-started/overview/[code]/middleware';
import { featureFlagsInEdgeMiddleware } from './app/examples/feature-flags-in-edge-middleware/middleware';
import { manualPrecomputeMiddleware } from './app/concepts/precompute/manual/middleware';
import { automaticPrecomputeMiddleware } from './app/concepts/precompute/automatic/[code]/middleware';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/getting-started/overview') {
    return overviewMiddleware(request);
  }

  if (request.nextUrl.pathname === '/concepts/precompute/manual') {
    return manualPrecomputeMiddleware(request);
  }

  if (request.nextUrl.pathname === '/concepts/precompute/automatic') {
    return automaticPrecomputeMiddleware(request);
  }

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
    '/getting-started/overview',
    '/concepts/precompute/manual',
    '/concepts/precompute/automatic',
    '/examples/marketing-pages',
    '/examples/feature-flags-in-edge-middleware',
  ],
};

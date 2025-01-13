import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { marketingMiddleware } from './app/examples/marketing-pages/middleware';
import { featureFlagsInEdgeMiddleware } from './app/examples/feature-flags-in-edge-middleware/middleware';
import { pprShellsMiddleware } from './app/examples/suspense-fallbacks/middleware';
import { manualPrecomputeMiddleware } from './app/concepts/precompute/manual/middleware';
import { automaticPrecomputeMiddleware } from './app/concepts/precompute/automatic/[code]/middleware';
import { pagesRouterMiddleware } from './lib/pages-router-precomputed/middleware';

export function middleware(request: NextRequest) {
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

  if (request.nextUrl.pathname === '/examples/pages-router-precomputed') {
    return pagesRouterMiddleware(request);
  }
  if (request.nextUrl.pathname === '/examples/suspense-fallbacks') {
    return pprShellsMiddleware(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/concepts/precompute/manual',
    '/concepts/precompute/automatic',
    '/examples/marketing-pages',
    '/examples/feature-flags-in-edge-middleware',
    '/examples/pages-router-precomputed',
    '/examples/suspense-fallbacks',
  ],
};

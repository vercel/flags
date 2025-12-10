import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { automaticPrecomputeProxy } from './app/concepts/precompute/automatic/[code]/proxy';
import { manualPrecomputeProxy } from './app/concepts/precompute/manual/proxy';
import { featureFlagsInProxy } from './app/examples/feature-flags-in-proxy/proxy';
import { marketingProxy } from './app/examples/marketing-pages/proxy';
import { pprShellsProxy } from './app/examples/suspense-fallbacks/proxy';
import { pagesRouterProxy } from './lib/pages-router-precomputed/proxy';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/concepts/precompute/manual') {
    return manualPrecomputeProxy(request);
  }

  if (request.nextUrl.pathname === '/concepts/precompute/automatic') {
    return automaticPrecomputeProxy(request);
  }

  if (request.nextUrl.pathname === '/examples/marketing-pages') {
    return marketingProxy(request);
  }

  if (request.nextUrl.pathname === '/examples/feature-flags-in-proxy') {
    return featureFlagsInProxy(request);
  }

  if (request.nextUrl.pathname === '/examples/pages-router-precomputed') {
    return pagesRouterProxy(request);
  }
  if (request.nextUrl.pathname === '/examples/suspense-fallbacks') {
    return pprShellsProxy(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/concepts/precompute/manual',
    '/concepts/precompute/automatic',
    '/examples/marketing-pages',
    '/examples/feature-flags-in-proxy',
    '/examples/pages-router-precomputed',
    '/examples/suspense-fallbacks',
  ],
};

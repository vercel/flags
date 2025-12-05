import { type NextRequest, NextResponse } from 'next/server';
import { basicProxyFlag } from './flags';

export async function featureFlagsInEdgeMiddleware(request: NextRequest) {
  const active = await basicProxyFlag();
  const variant = active ? 'variant-on' : 'variant-off';

  return NextResponse.rewrite(
    new URL(`/examples/feature-flags-in-proxy/${variant}`, request.url),
  );
}

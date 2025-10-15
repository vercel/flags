import { type NextRequest, NextResponse } from 'next/server';
import { basicEdgeMiddlewareFlag } from './flags';

export async function featureFlagsInEdgeMiddleware(request: NextRequest) {
  const active = await basicEdgeMiddlewareFlag();
  const variant = active ? 'variant-on' : 'variant-off';

  return NextResponse.rewrite(
    new URL(
      `/examples/feature-flags-in-edge-middleware/${variant}`,
      request.url,
    ),
  );
}

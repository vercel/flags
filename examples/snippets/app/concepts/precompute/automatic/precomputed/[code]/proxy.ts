import { precompute } from 'flags/next';
import { type NextRequest, NextResponse } from 'next/server';
import { marketingFlags } from './flags';

export async function automaticPrecomputeProxy(request: NextRequest) {
  // precompute the flags
  const code = await precompute(marketingFlags);

  // rewrite the page with the code, nested under a `precomputed` folder so
  // it's clear which routes are served via the precompute pattern
  return NextResponse.rewrite(
    new URL(`/concepts/precompute/automatic/precomputed/${code}`, request.url),
  );
}

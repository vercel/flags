import { precompute } from 'flags/next/precompute';
import { type NextRequest, NextResponse } from 'next/server';
import { PRECOMPUTE_SECRET, precomputeFlags } from './flags';

// Evaluates the flags in the proxy, and rewrites to the static page of
// their values
export async function proxy(request: NextRequest) {
  const code = await precompute(precomputeFlags, {
    request,
    secret: PRECOMPUTE_SECRET,
  });
  return NextResponse.rewrite(new URL(`/precomputed/${code}`, request.url));
}

export const config = { matcher: '/precomputed' };

import { precompute } from 'flags/next/precompute';
import { type NextRequest, NextResponse } from 'next/server';
import { precomputeFlags } from './precompute';

// Evaluates the flags in the proxy, and rewrites to the static page of
// their values
export async function proxy(request: NextRequest) {
  const code = await precompute(precomputeFlags, { request });
  return NextResponse.rewrite(new URL(`/precomputed/${code}`, request.url));
}

export const config = { matcher: '/precomputed' };

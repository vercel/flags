import { precompute } from '@vercel/flags/next';
import { type NextRequest, NextResponse } from 'next/server';
import { marketingFlags } from './flags';

export async function automaticPrecomputeMiddleware(request: NextRequest) {
  // precompute the flags
  const code = await precompute(marketingFlags);

  // rewrite the page with the code
  return NextResponse.rewrite(
    new URL(`/concepts/precompute/automatic/${code}`, request.url),
  );
}

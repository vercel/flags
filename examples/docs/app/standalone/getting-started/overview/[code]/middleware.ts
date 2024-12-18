import { precompute } from '@vercel/flags/next';
import { type NextRequest, NextResponse } from 'next/server';
import { overviewFlags } from './flags';

export async function overviewMiddleware(request: NextRequest) {
  // precompute the flags
  const code = await precompute(overviewFlags);

  // rewrite the page with the code
  return NextResponse.rewrite(
    new URL(`/getting-started/overview/${code}`, request.url),
  );
}

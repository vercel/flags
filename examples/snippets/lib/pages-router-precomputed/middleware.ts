import { precompute } from '@vercel/flags/next';
import { type NextRequest, NextResponse } from 'next/server';
import { exampleFlags } from './flags';

export async function pagesRouterMiddleware(request: NextRequest) {
  // precompute the flags
  const code = await precompute(exampleFlags);

  return NextResponse.rewrite(
    new URL(`/examples/pages-router-precomputed/${code}`, request.url),
  );
}

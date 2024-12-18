import { type NextRequest, NextResponse } from 'next/server';
import { manualPrecomputeFlag } from './flags';

export async function manualPrecomputeMiddleware(request: NextRequest) {
  // use the flag
  const value = await manualPrecomputeFlag();

  // rewrite the page to the variant
  return NextResponse.rewrite(
    new URL(
      `/concepts/precompute/manual/${value ? 'variant-a' : 'variant-b'}`,
      request.url,
    ),
  );
}

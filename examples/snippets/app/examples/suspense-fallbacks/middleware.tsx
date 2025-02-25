import { precompute } from 'flags/next';
import { type NextRequest, NextResponse } from 'next/server';
import { coreFlags } from './flags';

export async function pprShellsMiddleware(request: NextRequest) {
  // precompute the flags
  const code = await precompute(coreFlags);

  // rewrite the page with the code
  return NextResponse.rewrite(
    new URL(`/examples/suspense-fallbacks/${code}`, request.url),
  );
}

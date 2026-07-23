import { precompute } from 'flags/next';
import { type NextRequest, NextResponse } from 'next/server';
import { coreFlags } from './flags';

export async function pprShellsProxy(request: NextRequest) {
  // precompute the flags
  const code = await precompute(coreFlags);

  // rewrite the page with the code. Precomputed pages are nested under a
  // `precomputed` folder by convention.
  return NextResponse.rewrite(
    new URL(`/examples/suspense-fallbacks/precomputed/${code}`, request.url),
  );
}

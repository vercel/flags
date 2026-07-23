import { precompute } from 'flags/next';
import { type NextRequest, NextResponse } from 'next/server';
import { exampleFlags } from './flags';

export async function pagesRouterProxy(request: NextRequest) {
  // precompute the flags
  const code = await precompute(exampleFlags);

  // Precomputed pages are nested under a `precomputed` folder by convention.
  return NextResponse.rewrite(
    new URL(
      `/examples/pages-router-precomputed/precomputed/${code}`,
      request.url,
    ),
  );
}

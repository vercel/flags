import { precompute } from 'flags/next';
import { isMarkdownPreferred, rewritePath } from 'fumadocs-core/negotiation';
import { type NextRequest, NextResponse } from 'next/server';
import { rootFlags } from './lib/custom/flags';

const { rewrite: rewriteLLM } = rewritePath('/docs/*path', '/llms.mdx/*path');

export const config = { matcher: ['/'] };

const proxy = async (request: NextRequest) => {
  // Handle markdown preference for LLM docs
  if (isMarkdownPreferred(request)) {
    const result = rewriteLLM(request.nextUrl.pathname);

    if (result) {
      return NextResponse.rewrite(new URL(result, request.nextUrl));
    }
  }

  // Handle flags precomputation for root path
  if (request.nextUrl.pathname === '/') {
    const code = await precompute(rootFlags);
    return NextResponse.rewrite(new URL(`/home/${code}`, request.url));
  }

  return NextResponse.next();
};

export default proxy;

import { createProxy } from "@vercel/geistdocs/proxy";
import { precompute } from "flags/next";
import { NextResponse } from "next/server";
import { rootFlags } from "@/flags";
import { config as geistdocsConfig } from "@/lib/geistdocs/config";
import { trackMdRequest } from "@/lib/geistdocs/md-tracking";

const proxy = createProxy({
  config: geistdocsConfig,
  trackMarkdownRequest: trackMdRequest,
  before: async ({ defaultLanguage, request }) => {
    if (request.nextUrl.pathname !== "/") {
      return null;
    }

    const code = await precompute(rootFlags);
    return NextResponse.rewrite(
      new URL(`/${defaultLanguage}/home/${code}`, request.url)
    );
  },
});

export const config = {
  // Matcher ignoring `/_next/`, `/api/`, static assets, favicon, sitemap, robots, etc.
  matcher: [
    "/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|\\.well-known/vercel/flags).*)",
  ],
};

export default proxy;

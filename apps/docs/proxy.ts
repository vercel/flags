import { createProxy } from "@vercel/geistdocs/proxy";
import { precompute } from "flags/next";
import { NextResponse } from "next/server";
import { rootFlags } from "@/flags";
import { USER_ID_COOKIE, USER_ID_HEADER } from "@/lib/flags/constants";
import { getOrGenerateUserId } from "@/lib/flags/identify";
import { config as geistdocsConfig } from "@/lib/geistdocs/config";
import { trackMdRequest } from "@/lib/geistdocs/md-tracking";

const proxy = createProxy({
  config: geistdocsConfig,
  trackMarkdownRequest: trackMdRequest,
  // Runs after Geistdocs markdown negotiation so agents and
  // `Accept: text/markdown` requests to `/` still receive `/agents.md`.
  after: async ({ defaultLanguage, request }) => {
    if (request.nextUrl.pathname !== "/") {
      return null;
    }

    const userId = await getOrGenerateUserId(
      request.cookies,
      request.headers
    );
    const code = await precompute(rootFlags);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(USER_ID_HEADER, userId);
    const response = NextResponse.rewrite(
      new URL(`/${defaultLanguage}/home/${code}`, request.url),
      { request: { headers: requestHeaders } }
    );
    response.cookies.set(USER_ID_COOKIE, userId, { path: "/" });
    return response;
  },
});

export const config = {
  // Matcher ignoring `/_next/`, `/api/`, static assets, favicon, sitemap, robots, etc.
  matcher: [
    "/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|\\.well-known/vercel/flags).*)",
  ],
};

export default proxy;

import { precompute } from '@vercel/flags/next';
import { type NextRequest, NextResponse } from 'next/server';
import { precomputedFlags } from './flags';

export const config = {
  matcher: ['/', '/pages-router', '/app-router-static', '/pages-router-static'],
};

export default async function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname === '/' ||
    request.nextUrl.pathname === '/pages-router'
  ) {
    // pretend the request had a cookie so we can reliably test it without having
    // to actually set a cookie in the browser. this way it works during local dev easily
    const requestClone = request.clone();
    requestClone.headers.set('cookie', 'example-cookie=example-cookie-value');
    return NextResponse.next({ request: requestClone });
  }

  if (request.nextUrl.pathname === '/app-router-static') {
    // pretend the request had a cookie so we can reliably test it without having
    // to actually set a cookie in the browser. this way it works during local dev easily
    request.cookies.set('example-cookie', 'example-cookie-value');
    const code = await precompute(precomputedFlags);
    const nextUrl = new URL(
      `/app-router-precomputed/${code}${request.nextUrl.search}`,
      request.url,
    );

    return NextResponse.rewrite(nextUrl.toString());
  }

  if (request.nextUrl.pathname === '/pages-router-static') {
    // pretend the request had a cookie so we can reliably test it without having
    // to actually set a cookie in the browser. this way it works during local dev easily
    request.cookies.set('example-cookie', 'example-cookie-value');
    const code = await precompute(precomputedFlags);
    const nextUrl = new URL(
      `/pages-router-precomputed/${code}${request.nextUrl.search}`,
      request.url,
    );

    return NextResponse.rewrite(nextUrl.toString(), { request });
  }

  return NextResponse.next();
}

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.cookies.get('visitorId')) {
    const visitorId = crypto.randomUUID();
    response.cookies.set('visitorId', visitorId, { path: '/' });
  }

  return response;
}

export const config = {
  matcher: '/checkout',
};

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const visitorId =
    request.cookies.get('visitorId')?.value ?? crypto.randomUUID();

  return NextResponse.next({
    headers: {
      'Set-Cookie': `visitorId=${visitorId}; Path=/`,
      'x-visitor-id': visitorId,
    },
  });
}

export const config = {
  matcher: ['/', '/checkout'],
};

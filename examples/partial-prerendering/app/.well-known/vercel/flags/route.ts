import { ApiData, verifyAccess } from '@vercel/flags';
import * as middlewareDefinitions from '../../../../middleware-flags';
import * as serverDefinitions from '../../../../server-flags';
import { getProviderData } from '@vercel/flags/next';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic'; // defaults to auto

export async function GET(request: NextRequest) {
  const access = await verifyAccess(request.headers.get('Authorization'));
  if (!access) return NextResponse.json(null, { status: 401 });

  const middlewareFlags = getProviderData(middlewareDefinitions);
  const serverFlags = getProviderData(serverDefinitions);

  return NextResponse.json<ApiData>({
    definitions: {
      ...middlewareFlags.definitions,
      ...serverFlags.definitions,
    },
    hints: [...middlewareFlags.hints, ...serverFlags.hints],
  });
}

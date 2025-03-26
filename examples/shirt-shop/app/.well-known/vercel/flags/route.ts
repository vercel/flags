import { type ApiData, verifyAccess } from 'flags';
import { bucketAdapter, getProviderData } from '@flags-sdk/bucket';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic'; // defaults to auto

export async function GET(request: NextRequest) {
  const access = await verifyAccess(request.headers.get('Authorization'));
  if (!access) return NextResponse.json(null, { status: 401 });

  const providerData = await getProviderData(
    await bucketAdapter.bucketClient(),
  );
  return NextResponse.json<ApiData>(providerData);
}

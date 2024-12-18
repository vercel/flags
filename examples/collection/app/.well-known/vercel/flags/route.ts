import { NextResponse, type NextRequest } from 'next/server';
import { verifyAccess, type ApiData } from '@vercel/flags';
import { getProviderData } from '@vercel/flags/next';
// The @/ import is not working in the ".well-known" folder due do the dot in the path.
// We need to use relative paths instead. This seems like a TypeScript issue.
import * as marketingFlags from '../../../examples/marketing-pages/flags';
import * as dashboardFlags from '../../../examples/dashboard-pages/flags';
import * as adapterFlags from '../../../concepts/adapters/flags';
import * as topLevelFlags from '../../../../flags';
import * as basicEdgeMiddlewareFlags from '../../../examples/feature-flags-in-edge-middleware/flags';
import * as basicIdentifyFlags from '../../../concepts/identify/basic/flags';
import * as fullIdentifyFlags from '../../../concepts/identify/full/flags';

export async function GET(request: NextRequest) {
  const access = await verifyAccess(request.headers.get('Authorization'));
  if (!access) return NextResponse.json(null, { status: 401 });

  return NextResponse.json<ApiData>(
    getProviderData({
      ...marketingFlags,
      ...dashboardFlags,
      ...topLevelFlags,
      ...adapterFlags,
      ...basicEdgeMiddlewareFlags,
      ...basicIdentifyFlags,
      ...fullIdentifyFlags,
    }),
  );
}

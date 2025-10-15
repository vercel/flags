import { type ApiData, verifyAccess } from 'flags';
import { getProviderData } from 'flags/next';
import { type NextRequest, NextResponse } from 'next/server';
import * as topLevelFlags from '../../../../flags';
import * as adapterFlags from '../../../concepts/adapters/flags';
import * as basicIdentifyFlags from '../../../concepts/identify/basic/flags';
import * as fullIdentifyFlags from '../../../concepts/identify/full/flags';
import * as dashboardFlags from '../../../examples/dashboard-pages/flags';
import * as basicEdgeMiddlewareFlags from '../../../examples/feature-flags-in-edge-middleware/flags';
// The @/ import is not working in the ".well-known" folder due do the dot in the path.
// We need to use relative paths instead. This seems like a TypeScript issue.
import * as marketingFlags from '../../../examples/marketing-pages/flags';

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

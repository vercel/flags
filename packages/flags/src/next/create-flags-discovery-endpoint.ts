// Must not import anything other than types from next/server, as importing
// the real next/server would prevent flags/next from working in Pages Router.
import type { NextRequest } from 'next/server';
import { ApiData } from '../types';
import { verifyAccess } from '../lib/verify-access';
import { version } from '..';

/**
 * Creates the Flags Discovery Endpoint for Next.js, which is a well-known endpoint used
 * by Flags Explorer to discover the flags of your application.
 *
 * @param getApiData a function returning the API data
 * @param options accepts a secret
 * @returns a Next.js Route Handler
 */
export function createFlagsDiscoveryEndpoint(
  getApiData: (request: NextRequest) => Promise<ApiData> | ApiData,
  options?: {
    secret?: string | undefined;
  },
) {
  return async (request: NextRequest): Promise<Response> => {
    const access = await verifyAccess(
      request.headers.get('Authorization'),
      options?.secret,
    );
    if (!access) return Response.json(null, { status: 401 });

    const apiData = await getApiData(request);
    return new Response(JSON.stringify(apiData), {
      headers: {
        'x-flags-sdk-version': version,
        'content-type': 'application/json',
      },
    });
  };
}

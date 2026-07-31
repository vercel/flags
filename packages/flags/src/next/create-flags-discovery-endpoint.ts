// Must not import anything other than types from next/server, as importing
// the real next/server would prevent flags/next from working in Pages Router.
import type { NextRequest } from 'next/server';
import { version } from '..';
import { computeEtag } from '../lib/compute-etag';
import { verifyAccess } from '../lib/verify-access';
import type { ApiData } from '../types';

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
    const body = JSON.stringify(apiData);
    const etag = computeEtag(body);

    // We handle conditional requests ourselves, rather than relying on an
    // upstream cache to generate the 304, so we can guarantee
    // x-flags-sdk-version is always present, even on a 304 response.
    const headers: Record<string, string> = {
      'x-flags-sdk-version': version,
      'cache-control': 'no-cache',
      etag,
    };

    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(body, {
      headers: { ...headers, 'content-type': 'application/json' },
    });
  };
}

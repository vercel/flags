// Must not import anything other than types from next/server, as importing
// the real next/server would prevent flags/next from working in Pages Router.
import type { NextRequest } from 'next/server';
import { handleDiscoveryRequest } from '../shared/discovery';
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
    return handleDiscoveryRequest({
      authHeader: request.headers.get('Authorization'),
      secret: options?.secret,
      getApiData: () => getApiData(request),
      unauthorized: () => Response.json(null, { status: 401 }),
      respond: (apiData, headers) =>
        new Response(JSON.stringify(apiData), {
          headers: { ...headers, 'content-type': 'application/json' },
        }),
    });
  };
}

import { version } from '../../package.json';
import { verifyAccess } from '../lib/verify-access';
import type { ApiData } from '../types';

/** Response header that carries the Flags SDK version on discovery responses. */
export const FLAGS_VERSION_HEADER = 'x-flags-sdk-version';

/**
 * Shared control flow for a Flags Discovery Endpoint, which is the well-known
 * endpoint Flags Explorer uses to discover an application's flags.
 *
 * Verifies the request's `Authorization` header, then either renders an
 * unauthorized response or resolves the API data and renders it with the
 * `x-flags-sdk-version` header set. Response construction is injected so each
 * framework can use its own primitives.
 *
 * @param authHeader - The request's `Authorization` header value
 * @param secret - The secret used to verify access (defaults to `FLAGS_SECRET`)
 * @param getApiData - Resolves the API data once access is granted
 * @param unauthorized - Builds the 401 response
 * @param respond - Builds the success response from the API data and the
 *   version headers it must include
 */
export async function handleDiscoveryRequest<TResponse>({
  authHeader,
  secret,
  getApiData,
  unauthorized,
  respond,
}: {
  authHeader: string | null;
  secret: string | undefined;
  getApiData: () => Promise<ApiData> | ApiData;
  unauthorized: () => TResponse;
  respond: (apiData: ApiData, headers: Record<string, string>) => TResponse;
}): Promise<TResponse> {
  const access = await verifyAccess(authHeader, secret);
  if (!access) return unauthorized();

  const apiData = await getApiData();
  return respond(apiData, { [FLAGS_VERSION_HEADER]: version });
}

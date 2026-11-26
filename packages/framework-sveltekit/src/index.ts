import {
  error,
  type Handle,
  json,
  type RequestEvent,
  type RequestHandler,
} from '@sveltejs/kit';
import {
  type ApiData,
  encryptFlagValues,
  type FlagValuesType,
  getEvaluatedFlagValues,
  getProviderData,
  type KeyedFlagDefinitionType,
  safeJsonStringify,
  verifyAccess,
  version,
} from 'flags';
import { loadSvelteKitEnv } from './binding';

/**
 * The secret of the application: the given one, or else `FLAGS_SECRET` of
 * `process.env` or of the environment of SvelteKit.
 */
async function secretOf(
  secret: string | undefined,
): Promise<string | undefined> {
  if (secret) {
    return secret;
  }
  return process.env.FLAGS_SECRET || (await loadSvelteKitEnv()).FLAGS_SECRET;
}

/**
 * The handle hook of the Flags SDK for SvelteKit. A flag gets the current
 * request from SvelteKit itself, so the hook is optional. It adds:
 *
 * - the values of the flags which a page evaluated, encrypted, at the end
 *   of the HTML, so that they show up in the Vercel Toolbar;
 * - with `flags`, the endpoint `/.well-known/vercel/flags`, which Flags
 *   Explorer reads.
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { createHandle } from '@flags-sdk/sveltekit';
 * import * as flags from '$lib/flags';
 *
 * export const handle = createHandle({ flags });
 * ```
 */
export function createHandle({
  secret,
  flags,
}: {
  secret?: string;
  flags?: Record<string, KeyedFlagDefinitionType | readonly unknown[]>;
} = {}): Handle {
  return async function handle({ event, resolve }) {
    if (
      flags &&
      // avoid creating the URL object for every request by checking with includes() first
      event.request.url.includes('/.well-known/') &&
      new URL(event.request.url).pathname === '/.well-known/vercel/flags'
    ) {
      const access = await verifyAccess(
        event.request.headers.get('Authorization'),
        await secretOf(secret),
      );
      if (!access) {
        return new Response(null, { status: 401 });
      }
      return Response.json(getProviderData(flags), {
        headers: {
          'x-flags-sdk-version': version,
          'cache-control': 'no-store',
        },
      });
    }

    return resolve(event, {
      transformPageChunk: async ({ html }) => {
        // SvelteKit renders the response outside of getRequestEvent(), so
        // the request of the event identifies it
        const values = await getEvaluatedFlagValues(event.request);
        if (Object.keys(values).length === 0) {
          return html;
        }
        // The values of the flags which the page used, for the Vercel
        // Toolbar. The client is never aware of them.
        const encrypted = await encryptFlagValues(
          values as FlagValuesType,
          await secretOf(secret),
        ).catch(() => '');
        // Empty without a secret and without the public key of Vercel
        if (!encrypted) {
          return html;
        }
        return html.replace(
          '</body>',
          `<script type="application/json" data-flag-values>${safeJsonStringify(encrypted)}</script></body>`,
        );
      },
    });
  };
}

/**
 * Creates the Flags Discovery Endpoint for SvelteKit, which Flags Explorer
 * reads, e.g. in `src/routes/.well-known/vercel/flags/+server.ts`.
 *
 * @param getApiData a function returning the API data
 * @param options accepts a secret
 * @returns a RequestHandler
 */
export function createFlagsDiscoveryEndpoint(
  getApiData: (event: RequestEvent) => Promise<ApiData> | ApiData,
  options?: {
    secret?: string | undefined;
  },
): RequestHandler {
  return async (event) => {
    const access = await verifyAccess(
      event.request.headers.get('Authorization'),
      await secretOf(options?.secret),
    );
    if (!access) {
      error(401);
    }
    const apiData = await getApiData(event);
    return json(apiData, { headers: { 'x-flags-sdk-version': version } });
  };
}

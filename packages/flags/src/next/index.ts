/**
 * The integration of the Flags SDK for Next.js. The plugin `withFlags` of
 * `flags/next/plugin` points the alias `flags/integration` to this module.
 * The application does not import it.
 *
 * It uses only the public API of the SDK, so that Next.js could take it
 * over, e.g. as its own module behind the same alias.
 */
import { cookies, headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import type { SetupIntegration } from '../integration';
import type { FlagsRequestInit } from '../types';

/**
 * Gives the runtime the current request of Next.js, a way to load
 * `flags.config.ts`, and the errors which Next.js must receive.
 *
 * It must not import `flags` statically, because `flags` imports this
 * module. `flags.config.ts` imports `flags`, so it is loaded with a dynamic
 * `import()`.
 */
export const setupIntegration: SetupIntegration = async (runtime) => {
  runtime.setRequestSource(getRequest);
  // Next.js uses errors as signals, e.g. to stop the static rendering. They
  // must reach Next.js, also from steps of the context chain or providers.
  runtime.setRethrow(unstable_rethrow);
  // A source, so that the runtime loads the configuration again after a
  // change in development
  runtime.setConfigSource(async () => (await import('flags/config')).config);
};

/**
 * Returns the current request: `headers()` and `cookies()`. Next.js gives no
 * full request in pages. `headers()` returns the same object during one
 * request, so the SDK identifies the request by it.
 *
 * @internal
 */
export async function getRequest(): Promise<FlagsRequestInit | undefined> {
  try {
    const [requestHeaders, requestCookies] = await Promise.all([
      headers(),
      cookies(),
    ]);
    return { headers: requestHeaders, cookies: requestCookies };
  } catch (error) {
    // Next.js throws internal errors, e.g. to stop the static rendering.
    // They must reach Next.js.
    unstable_rethrow(error);
    // Outside of a request, e.g. at build time, there is no request
    return undefined;
  }
}

/**
 * The framework binding of the Flags SDK for Next.js. The plugin
 * `withFlags` of `@flags-sdk/next/plugin` points the alias
 * `flags/framework` to this module. The application does not import it.
 *
 * It uses only the public API of the SDK, so that Next.js could take it
 * over, e.g. as its own module behind the same alias.
 */

import type { FlagsRequestInit, SetupFramework } from 'flags';
import { cookies, headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';

/**
 * The error for a flag in a cache scope, e.g. `'use cache'`. It is a usage error, so the
 * runtime must not return the default value of the flag for it.
 */
class FlagInCacheError extends Error {
  constructor(cause: unknown) {
    super(
      'flags: A flag can not be evaluated inside a cache scope, e.g. "use cache", because a flag value must not be cached. Evaluate the flag outside of the cached function, and pass the value in as an argument.',
      { cause },
    );
    this.name = 'FlagInCacheError';
  }
}

/**
 * Throws an error again if Next.js or the application must receive it.
 *
 * @internal
 */
export function rethrow(error: unknown): void {
  unstable_rethrow(error);
  if (error instanceof FlagInCacheError) throw error;
}

/**
 * Gives the runtime the current request of Next.js, a way to load
 * `flags.config.ts`, and the errors which Next.js must receive.
 *
 * It must not import `flags` at runtime, because `flags` imports this
 * module. Type imports are removed by the build. `flags.config.ts` imports `flags`, so it is loaded with a dynamic
 * `import()`.
 */
export const setupFramework: SetupFramework = async (runtime) => {
  runtime.setRequestSource(getRequest);
  // Next.js uses errors as signals, e.g. to stop the static rendering. They
  // must reach Next.js, also from steps of the context chain or providers.
  runtime.setRethrow(rethrow);
  // A source, so that the runtime loads the configuration again after a
  // change in development
  runtime.setConfigSource(async () => (await import('flags/config')).config);
};

/**
 * Returns the current request: `headers()` and `cookies()`. Next.js gives no
 * full request in pages. `headers()` returns the same object during one
 * request, so the SDK identifies the request by it.
 *
 * It also waits for `connection()`, because a flag value can change at any
 * time: an evaluation belongs to the render at request time, not to a
 * prerender. Thus, a provider can use `Date.now()` or I/O. Next.js gives one
 * promise for each request, so this adds no work. A precomputed value does
 * not use the request, so it can still be prerendered.
 *
 * @internal
 */
export async function getRequest(): Promise<FlagsRequestInit | undefined> {
  try {
    const [requestHeaders, requestCookies] = await Promise.all([
      headers(),
      cookies(),
      connection(),
    ]);
    return { headers: requestHeaders, cookies: requestCookies };
  } catch (error) {
    // Next.js throws internal errors, e.g. to stop the static rendering.
    // They must reach Next.js.
    unstable_rethrow(error);
    // Next.js has no public API to find a cache scope, so the message of
    // its error is the signal. Next.js also fails the route itself.
    if (error instanceof Error && isCacheScopeError(error)) {
      throw new FlagInCacheError(error);
    }
    // Outside of a request, e.g. at build time, there is no request
    return undefined;
  }
}

function isCacheScopeError(error: Error): boolean {
  return (
    error.message.includes('inside "use cache') ||
    error.message.includes('cached with `unstable_cache()`')
  );
}

/**
 * The framework binding of the Flags SDK for Nuxt, in the server of Nitro.
 * The module `@flags-sdk/nuxt` points the alias `flags/framework` to this
 * module. The application does not import it.
 *
 * It imports the functions of Nitro and h3 from `#imports`, the
 * auto-imports of Nitro, because an application of Nuxt depends on `nuxt`,
 * not on `nitropack` or `h3`. It must not import `flags` at runtime,
 * because `flags` imports this module.
 */

import type { FlagsRequestInit, SetupFramework } from 'flags';
import { getRequestURL, isError, useEvent } from '#imports';

/**
 * Gives the runtime the current request of Nitro, the errors which Nitro
 * must receive, and a way to load `flags.config.ts`.
 */
export const setupFramework: SetupFramework = (runtime) => {
  runtime.setRequestSource(getRequest);
  runtime.setRethrow(rethrowSignal);
  runtime.setConfigSource(async () => (await import('flags/config')).config);
};

/**
 * Returns the current request with `useEvent()`, which needs the option
 * `experimental.asyncContext` of Nitro. The module `@flags-sdk/nuxt` sets
 * it.
 * `event.headers` stays the same object during one request, so it
 * identifies the request. Outside of a request, there is no request.
 *
 * @internal
 */
export function getRequest(): FlagsRequestInit | undefined {
  try {
    const event = useEvent();
    return { headers: event.headers, url: getRequestURL(event) };
  } catch {
    return undefined;
  }
}

/**
 * `createError()` throws an `H3Error`, which Nitro must receive unchanged,
 * e.g. a 403 from a step of the evaluation context chain.
 *
 * @internal
 */
export function rethrowSignal(error: unknown): void {
  if (isError(error)) throw error;
}

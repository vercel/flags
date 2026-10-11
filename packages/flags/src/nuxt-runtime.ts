/**
 * The framework binding of the Flags SDK for Nuxt, in the server of Nitro.
 * The module `flags/nuxt` points the alias `flags/framework` to this module.
 * The application does not import it.
 *
 * It imports from `#imports` of Nitro, so that the SDK does not depend on
 * `nitropack` or `h3`. It must not import `flags` statically, because
 * `flags` imports this module.
 */
import { getRequestURL, useEvent } from '#imports';
import type { SetupFramework } from './framework';
import type { FlagsRequestInit } from './types';

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
 * `experimental.asyncContext` of Nitro. The module `flags/nuxt` sets it.
 * `event.headers` stays the same object during one request, so it
 * identifies the request. Outside of a request, there is no request.
 *
 * @internal
 */
export function getRequest(): FlagsRequestInit | undefined {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: a function of Nitro, not a React hook
    const event = useEvent();
    return { headers: event.headers, url: getRequestURL(event) };
  } catch {
    return undefined;
  }
}

/**
 * `createError()` of Nitro throws an `H3Error`, which Nitro must receive
 * unchanged, e.g. a 403 from a step of the evaluation context chain.
 *
 * @internal
 */
export function rethrowSignal(error: unknown): void {
  const type = (error as { constructor?: { __h3_error__?: unknown } } | null)
    ?.constructor;
  if (type?.__h3_error__ === true) throw error;
}

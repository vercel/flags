/**
 * The framework binding of the Flags SDK for SvelteKit. The Vite plugin of
 * `@flags-sdk/sveltekit/vite` points the alias `flags/framework` to this
 * module. The application does not import it.
 *
 * It uses only the public API of the SDK, so that SvelteKit could take it
 * over. It must not import `flags` at runtime, because `flags` imports this
 * module.
 */
import { isHttpError, isRedirect } from '@sveltejs/kit';
import type { FlagsRequestInit, SetupFramework } from 'flags';
import { getRequestEvent } from '$app/server';

/**
 * Gives the runtime the current request of SvelteKit, the errors which
 * SvelteKit must receive, and a way to load `flags.config.ts`.
 */
export const setupFramework: SetupFramework = (runtime) => {
  runtime.setRequestSource(getRequest);
  runtime.setRethrow(rethrowSignal);
  runtime.setConfigSource(async () => (await import('flags/config')).config);
};

/**
 * Returns the current request with `getRequestEvent()` (SvelteKit 2.20 or
 * newer). The request object stays the same during one request, so its
 * headers identify the request. Outside of a request, e.g. while SvelteKit
 * prerenders a page without a request, there is no request.
 *
 * @internal
 */
export function getRequest(): FlagsRequestInit | undefined {
  try {
    const event = getRequestEvent();
    return { headers: event.request.headers, url: event.url };
  } catch {
    return undefined;
  }
}

/**
 * `redirect()` and `error()` of SvelteKit throw objects, which SvelteKit
 * must receive unchanged, also from steps of the evaluation context chain.
 *
 * @internal
 */
export function rethrowSignal(error: unknown): void {
  if (isRedirect(error) || isHttpError(error)) throw error;
}

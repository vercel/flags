/**
 * The framework binding of the Flags SDK for TanStack Start. The Vite plugin
 * of `@flags-sdk/tanstack-start/vite` points the alias `flags/framework` to
 * this module. The application does not import it.
 *
 * TanStack Start has a package for React and one for Solid. The binding
 * imports their functions through `flags:tanstack-start/server` and
 * `flags:tanstack-start/router`, which the plugin resolves to the packages
 * of the project. It must not import `flags` at runtime, because `flags`
 * imports this module.
 */

import { isNotFound, isRedirect } from 'flags:tanstack-start/router';
import { getRequest as currentRequest } from 'flags:tanstack-start/server';
import type { FlagsRequestInit, SetupFramework } from 'flags';

/**
 * Gives the runtime the current request of TanStack Start, the errors which
 * TanStack Start must receive, and a way to load `flags.config.ts`.
 */
export const setupFramework: SetupFramework = (runtime) => {
  runtime.setRequestSource(getRequest);
  runtime.setRethrow(rethrowSignal);
  runtime.setConfigSource(async () => (await import('flags/config')).config);
};

/**
 * Returns the current request with `getRequest()` of TanStack Start: in
 * server functions, server routes, and the rendering of pages. The request
 * object stays the same during one request, so its headers identify it.
 * Outside of a request, there is no request.
 *
 * @internal
 */
export function getRequest(): FlagsRequestInit | undefined {
  try {
    const request = currentRequest();
    return { headers: request.headers, url: request.url };
  } catch {
    return undefined;
  }
}

/**
 * `redirect()` and `notFound()` of TanStack Router must reach TanStack Start
 * unchanged, also from steps of the evaluation context chain.
 *
 * @internal
 */
export function rethrowSignal(error: unknown): void {
  if (isRedirect(error) || isNotFound(error)) throw error;
}

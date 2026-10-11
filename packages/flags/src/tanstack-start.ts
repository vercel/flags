/**
 * The framework binding of the Flags SDK for TanStack Start. The Vite plugin
 * `flags({ framework: 'tanstack-start' })` of `flags/vite` points the alias
 * `flags/framework` to this module. The application does not import it.
 *
 * It imports `getRequest()` of TanStack Start through the module
 * `flags:tanstack-start/server`, which the plugin resolves to the server
 * module of `@tanstack/react-start` or `@tanstack/solid-start` of the
 * project. Thus, the SDK does not depend on TanStack Start. It must not
 * import `flags` statically, because `flags` imports this module.
 */
import { getRequest as currentRequest } from 'flags:tanstack-start/server';
import type { SetupFramework } from './framework';
import type { FlagsRequestInit } from './types';

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
 * `redirect()` of TanStack Router returns a `Response` with `options`, and
 * `notFound()` an object with `isNotFound`. TanStack Start must receive them
 * unchanged, also from steps of the evaluation context chain.
 *
 * @internal
 */
export function rethrowSignal(error: unknown): void {
  if (
    (error instanceof Response && 'options' in error) ||
    (error as { isNotFound?: unknown } | null)?.isNotFound === true
  ) {
    throw error;
  }
}

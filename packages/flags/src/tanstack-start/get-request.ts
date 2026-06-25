/**
 * Resolves the incoming request using TanStack Start's server utilities.
 *
 * The import is done dynamically so that this entrypoint doesn't hard-depend on
 * `@tanstack/react-start` being resolvable in environments that only use the
 * precompute or crypto helpers (e.g. when running inside Routing Middleware).
 */
export async function getStartRequest(): Promise<Request> {
  let getRequest: (() => Request | undefined) | undefined;

  try {
    const mod = (await import('@tanstack/react-start/server')) as Record<
      string,
      unknown
    >;
    // `getRequest` is the current API; `getWebRequest` is kept as a fallback for
    // older TanStack Start versions.
    getRequest = (mod.getRequest ?? mod.getWebRequest) as
      | (() => Request | undefined)
      | undefined;
  } catch {
    // ignore, handled below
  }

  if (typeof getRequest !== 'function') {
    throw new Error(
      'flags: Could not load "@tanstack/react-start/server". Make sure TanStack Start is installed, or call the flag with an explicit `Request`, e.g. `flag(request)`.',
    );
  }

  const request = getRequest();
  if (!request) {
    throw new Error(
      'flags: No request found. Feature flags can only be evaluated on the server, inside a route loader, server function, or server route. You may also pass a `Request` explicitly, e.g. `flag(request)`.',
    );
  }

  return request;
}

/**
 * The middleware of the Flags SDK for Express:
 *
 * ```ts
 * import { flags } from '@flags-sdk/express';
 * import { config } from './flags.config';
 *
 * app.use(flags({ config }));
 * ```
 *
 * Each request runs in `runtime.onInvoke`, so the flags get the request.
 * Express has Node.js requests, so the middleware converts the headers and
 * the URL.
 */
import { type Config, type FlagsRequestInit, runtime } from 'flags';

export interface FlagsMiddlewareOptions {
  /**
   * The configuration, e.g. the export `config` of `flags.config.ts`. The
   * middleware gives it to `runtime.configure` one time.
   */
  readonly config?: Config;
}

/**
 * The parts of a Node.js request which the middleware uses.
 */
interface NodeRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly url?: string;
  readonly originalUrl?: string;
  readonly protocol?: string;
}

/**
 * Converts a Node.js request, e.g. of Express, into what the SDK reads.
 *
 * @internal
 */
export function toFlagsRequest(request: NodeRequest): FlagsRequestInit {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      headers.append(name, item);
    }
  }
  const host = headers.get('host') ?? 'localhost';
  const path = request.originalUrl ?? request.url ?? '/';
  return {
    headers,
    url: new URL(path, `${request.protocol ?? 'http'}://${host}`),
  };
}

export function flags(
  options: FlagsMiddlewareOptions = {},
): (request: NodeRequest, response: unknown, next: () => void) => void {
  if (options.config) runtime.configure(options.config);
  return (request, _response, next) => {
    // The handlers which next calls run inside the scope of the request.
    // Errors of the flags go to the handlers, which pass them to next.
    void runtime.onInvoke(toFlagsRequest(request), next);
  };
}

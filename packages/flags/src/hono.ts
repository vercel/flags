/**
 * The middleware of the Flags SDK for Hono:
 *
 * ```ts
 * import { flags } from 'flags/hono';
 * import { config } from './flags.config';
 *
 * app.use(flags({ config }));
 * ```
 *
 * Each request runs in `runtime.onInvoke`, so the flags get the request.
 * Hono often runs without a bundler, so the configuration is an option, not
 * an alias. The SDK does not import `hono`.
 */
import type { Config } from './config';
import { runtime } from './runtime';

export interface FlagsMiddlewareOptions {
  /**
   * The configuration, e.g. the export `config` of `flags.config.ts`. The
   * middleware gives it to `runtime.configure` one time.
   */
  readonly config?: Config;
}

/**
 * The parts of the context of Hono which the middleware uses.
 */
interface HonoContext {
  readonly req: { readonly raw: Request };
}

/**
 * An `HTTPException` of Hono, e.g. a 403 from a step of the evaluation
 * context chain, must reach Hono unchanged.
 *
 * @internal
 */
export function rethrowSignal(error: unknown): void {
  // Hono does not set the name of the error, so the class is examined
  if (
    error instanceof Error &&
    error.constructor.name === 'HTTPException' &&
    typeof (error as { getResponse?: unknown }).getResponse === 'function'
  ) {
    throw error;
  }
}

export function flags(
  options: FlagsMiddlewareOptions = {},
): (c: HonoContext, next: () => Promise<void>) => Promise<void> {
  if (options.config) runtime.configure(options.config);
  runtime.setRethrow(rethrowSignal);
  return (c, next) => runtime.onInvoke(c.req.raw, next);
}

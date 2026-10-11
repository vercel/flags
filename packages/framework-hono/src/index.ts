/**
 * The middleware of the Flags SDK for Hono:
 *
 * ```ts
 * import { flags } from '@flags-sdk/hono';
 * import { config } from './flags.config';
 *
 * app.use(flags({ config }));
 * ```
 *
 * Each request runs in `runtime.onInvoke`, so the flags get the request.
 * Hono often runs without a bundler, so the configuration is an option, not
 * an alias.
 */
import { type Config, runtime } from 'flags';
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

export interface FlagsMiddlewareOptions {
  /**
   * The configuration, e.g. the export `config` of `flags.config.ts`. The
   * middleware gives it to `runtime.configure` one time.
   */
  readonly config?: Config;
}

/**
 * An `HTTPException` of Hono, e.g. a 403 from a step of the evaluation
 * context chain, must reach Hono unchanged.
 *
 * @internal
 */
export function rethrowSignal(error: unknown): void {
  if (error instanceof HTTPException) throw error;
}

export function flags(options: FlagsMiddlewareOptions = {}): MiddlewareHandler {
  if (options.config) runtime.configure(options.config);
  runtime.setRethrow(rethrowSignal);
  return (c, next) => runtime.onInvoke(c.req.raw, next);
}

import { evaluateFlags } from '../shared/evaluate';
import { readOverrides } from '../shared/overrides';
import { sealCookies, sealHeaders } from '../shared/seal';
import { tryGetSecret } from './env';
import type { Flag } from './types';

// Distributive value extraction so positional results infer per-element.
type BulkValue<F> = F extends Flag<infer V> ? V : never;

/**
 * Resolves a set of flags in a single call.
 *
 * Pre-reads headers, cookies, and the override cookie once for the whole batch,
 * then partitions flags by `(adapterId, identify)` so adapters that implement
 * `bulkDecide` evaluate an entire group in a single call. Flags whose adapters
 * don't opt into bulk evaluation, and flags with an inline `decide`, fall back
 * to the per-flag path — they still share the pre-read headers, cookies, and
 * overrides.
 *
 * Accepts either an array of flags (positional results) or an object whose
 * values are flags (keyed results).
 */
export async function evaluate<const T extends readonly Flag<any>[]>(
  flags: T,
  request: Request,
  secret?: string,
): Promise<{ [K in keyof T]: BulkValue<T[K]> }>;
export async function evaluate<T extends Record<string, Flag<any>>>(
  flags: T,
  request: Request,
  secret?: string,
): Promise<{ [K in keyof T]: BulkValue<T[K]> }>;
export async function evaluate(
  flags: Record<string, Flag<any>> | readonly Flag<any>[],
  request: Request,
  secret?: string,
): Promise<any> {
  const resolvedSecret = await tryGetSecret(secret);

  const headers = sealHeaders(request.headers);
  const cookies = sealCookies(request.headers);
  const overrides = await readOverrides(cookies, resolvedSecret);

  return evaluateFlags({
    // SvelteKit `Flag` functions carry `key`/`defaultValue`/`adapter` and the
    // bulk markers at runtime; the cast bridges the public type to the
    // internal `EvaluableFlag` shape.
    flags: flags as any,
    readonlyHeaders: headers,
    readonlyCookies: cookies,
    dedupeCacheKey: request.headers,
    overrides,
    invokeStandalone: (flagFn) =>
      (flagFn as (request: Request) => Promise<any>)(request),
  });
}

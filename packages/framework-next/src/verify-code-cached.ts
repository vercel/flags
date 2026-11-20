/**
 * The check of the signature of a precomputed code in `'use cache'`, for
 * Cache Components.
 *
 * The check uses WebCrypto, which resolves in a later task. In a prerender,
 * Next.js counts that as uncached data, so a precomputed page would not be
 * static. The result only depends on the code and the secret, so a cache
 * is correct. `withFlags` points `@flags-sdk/next/verify-code` to this
 * module.
 *
 * @internal
 */

import * as nextCache from 'next/cache';
import { verifyCode as verifyWithoutCache } from './verify-code';

// Next.js 15 has the function only as unstable_cacheLife
const cacheLife = ((nextCache as Record<string, unknown>).cacheLife ??
  (nextCache as Record<string, unknown>).unstable_cacheLife) as
  | ((profile: string) => void)
  | undefined;

async function cachedPayload(code: string, secret: string): Promise<number[]> {
  'use cache';
  // The payload of a code never changes. The longest profile of Next.js.
  cacheLife?.('max');
  // Plain numbers, which each cache of Next.js can serialize
  return Array.from(await verifyWithoutCache(code, secret));
}

export async function verifyCode(
  code: string,
  secret: string,
): Promise<Uint8Array> {
  return Uint8Array.from(await cachedPayload(code, secret));
}

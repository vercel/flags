/**
 * The encryption of `FlagValues` in `'use cache'`, for Cache Components.
 *
 * The encryption uses random values and the time. Next.js allows them in a
 * prerender only in a cache scope. The values of a precomputed page are the
 * same for each visitor, so one token for them is correct, and the page
 * stays static. `withFlags` points `@flags-sdk/next/encrypt-values` to this
 * module.
 *
 * @internal
 */

import { encryptFlagValues, type FlagValuesType } from 'flags/explorer';
import * as nextCache from 'next/cache';
import type {
  EncryptValuesOptions,
  EncryptValuesResult,
} from './encrypt-values';

// Next.js 15 has the function only as unstable_cacheLife
const cacheLife = ((nextCache as Record<string, unknown>).cacheLife ??
  (nextCache as Record<string, unknown>).unstable_cacheLife) as
  | ((profile: string) => void)
  | undefined;

export async function encryptValues(
  values: FlagValuesType,
  options?: EncryptValuesOptions,
): Promise<EncryptValuesResult> {
  'use cache';
  try {
    const token = await encryptFlagValues(values, options);
    // The token of the same values stays correct, so a precomputed page
    // does not have to revalidate for it. The longest profile of Next.js.
    cacheLife?.('max');
    return { token };
  } catch (error) {
    // Not thrown: Next.js fails the prerender when a cache function throws.
    // A short profile, so that a failure, e.g. of the network, does not
    // stay in the cache. Not 'seconds': a prerender treats it as dynamic.
    cacheLife?.('minutes');
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

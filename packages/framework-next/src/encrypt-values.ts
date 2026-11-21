/**
 * The encryption of `FlagValues`, without a cache. `withFlags` replaces this
 * module with `@flags-sdk/next/encrypt-values-cached` when Cache Components
 * are enabled, because `'use cache'` is an error without them.
 *
 * @internal
 */

import {
  type EncryptFlagValuesOptions,
  encryptFlagValues,
  type FlagValuesType,
} from 'flags/explorer';

/**
 * The options of `encryptFlagValues` which can be the arguments of a
 * `'use cache'` function: without `fetch`.
 */
export type EncryptValuesOptions = Omit<EncryptFlagValuesOptions, 'fetch'>;

/**
 * The token, or the message of the error. The function does not throw,
 * because Next.js fails a prerender when a `'use cache'` function throws,
 * also when the caller catches the error.
 */
export type EncryptValuesResult =
  | { readonly token: string }
  | { readonly error: string };

export async function encryptValues(
  values: FlagValuesType,
  options?: EncryptValuesOptions,
): Promise<EncryptValuesResult> {
  try {
    return { token: await encryptFlagValues(values, options) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

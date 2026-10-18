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
} from 'flags';

/**
 * The options of `encryptFlagValues` which can be the arguments of a
 * `'use cache'` function: without `fetch`.
 */
export type EncryptValuesOptions = Omit<EncryptFlagValuesOptions, 'fetch'>;

export function encryptValues(
  values: FlagValuesType,
  options?: EncryptValuesOptions,
): Promise<string> {
  return encryptFlagValues(values, options);
}

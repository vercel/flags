import { base64url, EncryptJWT, jwtDecrypt } from 'jose';
import type { JsonValue } from './types';

/**
 * Overrides for flags: the key of each flag, and its value.
 */
export type FlagOverrides = Record<string, JsonValue>;

/**
 * Decodes the shared secret. It must be 32 random bytes, encoded as
 * base64url.
 *
 * @internal
 */
export function decodeSecret(secret: string): Uint8Array {
  let key: Uint8Array;
  try {
    key = base64url.decode(secret);
  } catch {
    key = new Uint8Array();
  }
  if (key.length !== 32) {
    throw new Error(
      'flags: Invalid FLAGS_SECRET. It must be 32 random bytes, encoded as base64url.',
    );
  }
  return key;
}

/**
 * Creates an override token with the shared secret. Use it in tests, in CI or
 * in your own tools. The Vercel Toolbar creates these tokens when the
 * application has a `FLAGS_SECRET`.
 *
 * The format is the same as in v4 of the SDK: a JWE with direct encryption
 * (A256GCM), the purpose `overrides`, and the overrides in the claim `o`.
 *
 * @param secret - 32 random bytes, encoded as base64url. The default is the
 * environment variable `FLAGS_SECRET`.
 * @param expirationTime - The default is one year.
 *
 * @example
 * ```ts
 * const token = await encryptOverrides({ 'new-checkout': true });
 * // Set the token as the value of the cookie `flag-overrides`
 * ```
 */
export async function encryptOverrides(
  overrides: FlagOverrides,
  secret: string | undefined = process.env.FLAGS_SECRET,
  expirationTime: string | number | Date = '1y',
): Promise<string> {
  if (!secret) throw new Error('flags: Missing FLAGS_SECRET.');
  return new EncryptJWT({ o: overrides, pur: 'overrides' })
    .setExpirationTime(expirationTime)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(decodeSecret(secret));
}

/**
 * Decrypts an override token of the shared secret. Returns `undefined` for a
 * token which is not valid, e.g. expired or encrypted with a different
 * secret.
 *
 * @param secret - The default is the environment variable `FLAGS_SECRET`.
 * Throws if it is missing or not valid.
 *
 * @example
 * ```ts
 * const overrides = await decryptOverrides(token);
 * // { 'new-checkout': true }
 * ```
 */
export async function decryptOverrides(
  token: string,
  secret: string | undefined = process.env.FLAGS_SECRET,
): Promise<FlagOverrides | undefined> {
  if (!secret) throw new Error('flags: Missing FLAGS_SECRET.');
  return decryptWithKey(token, decodeSecret(secret));
}

/**
 * @internal
 */
export async function decryptWithKey(
  token: string,
  key: Uint8Array,
): Promise<FlagOverrides | undefined> {
  try {
    const { payload } = await jwtDecrypt(token, key, {
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
    });
    const purpose = payload.pur;
    const hasPurpose = Array.isArray(purpose)
      ? purpose.includes('overrides')
      : purpose === 'overrides';
    const overrides = payload.o;
    if (
      !hasPurpose ||
      typeof overrides !== 'object' ||
      overrides === null ||
      Array.isArray(overrides)
    ) {
      return undefined;
    }
    return overrides as FlagOverrides;
  } catch {
    return undefined;
  }
}

/**
 * The check of the signature of a precomputed code, without a cache.
 * `withFlags` replaces this module with `@flags-sdk/next/verify-code-cached`
 * when Cache Components are enabled, because `'use cache'` is an error
 * without them.
 *
 * @internal
 */

import { base64url, compactVerify } from 'jose';

/**
 * Checks the signature of a code, and returns its payload. Throws if the
 * signature is not valid.
 */
export async function verifyCode(
  code: string,
  secret: string,
): Promise<Uint8Array> {
  const { payload } = await compactVerify(code, base64url.decode(secret), {
    algorithms: ['HS256'],
  });
  return payload;
}

import { base64url } from 'jose';

/**
 * Decodes a secret in base64url, or in standard base64 (with `+`, `/` and
 * `=`), as v4 of the SDK did. The bytes stay the same, so the precompute
 * codes of v4 stay valid with the same secret.
 *
 * @internal
 */
export function decodeSecret(secret: string): Uint8Array {
  return base64url.decode(
    secret.trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  );
}

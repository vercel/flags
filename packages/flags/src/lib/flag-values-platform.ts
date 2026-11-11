import { EncryptJWT, importJWK, type JWK, type KeyLike } from 'jose';
import type { FlagValuesType } from '../types';
import { createKeySetCache, findVercelProject } from './vercel-platform';

/**
 * Where the public keys of Vercel for the flag values are.
 *
 * @internal
 */
export const VERCEL_FLAG_VALUES_JWKS_URL =
  'https://keys.vercel-flags.com/.well-known/jwks.json';

/**
 * The rules for flag values which are encrypted with the public key of the
 * platform. They are part of the protocol.
 *
 * @internal
 */
export const FLAG_VALUES_POLICY = Object.freeze({
  algorithm: 'ECDH-ES',
  encryption: 'A256GCM',
  audience: 'vercel:flag-values',
  purpose: 'flag-values',
  version: 1,
  maxProjectIdLength: 150,
});

/**
 * Encrypts flag values with the public key of Vercel, for the project of the
 * host. Only Vercel can decrypt them.
 *
 * Encryption with a public key gives no authenticity: each visitor can
 * encrypt other values. A receiver must not trust the values.
 */
export async function encryptFlagValuesForPlatform(
  values: FlagValuesType,
  expirationTime?: string | number | Date,
): Promise<string> {
  const policy = FLAG_VALUES_POLICY;
  const { projectId } = findVercelProject();
  if (!projectId) {
    throw new Error(
      'flags: Missing FLAGS_SECRET or a project ID for the encrypted flag values.',
    );
  }
  if (projectId.length > policy.maxProjectIdLength) {
    throw new Error(
      `flags: The project ID must have at most ${policy.maxProjectIdLength} characters.`,
    );
  }
  const { kid, key } = await publicKey.get();
  const jwt = new EncryptJWT({
    pur: policy.purpose,
    ver: policy.version,
    values,
  })
    .setAudience(policy.audience)
    .setIssuedAt()
    .setProtectedHeader({
      alg: policy.algorithm,
      enc: policy.encryption,
      kid,
      projectIds: [projectId],
    });
  if (expirationTime !== undefined) {
    jwt.setExpirationTime(expirationTime);
  }
  return jwt.encrypt(key);
}

type PublicKey = { readonly kid: string; readonly key: KeyLike };

const publicKey = createKeySetCache<PublicKey>(
  VERCEL_FLAG_VALUES_JWKS_URL,
  'the public key for the flag values',
  async (keySet) => {
    const jwk = selectKey(keySet.keys);
    const key = await importJWK(jwk, FLAG_VALUES_POLICY.algorithm);
    if (key instanceof Uint8Array) {
      throw new Error('the key is not public');
    }
    return { kid: jwk.kid as string, key };
  },
);

/**
 * Returns the first key of the set which can encrypt the flag values. The
 * platform lists its current key first.
 */
function selectKey(keys: Record<string, unknown>[]): JWK {
  const key = keys.find(
    (key) =>
      key.kty === 'EC' &&
      key.crv === 'P-256' &&
      typeof key.kid === 'string' &&
      (key.use === undefined || key.use === 'enc') &&
      (key.alg === undefined || key.alg === FLAG_VALUES_POLICY.algorithm),
  );
  if (!key) {
    throw new Error('the key set has no key for ECDH-ES with P-256');
  }
  return key as unknown as JWK;
}

/**
 * Only for tests.
 *
 * @internal
 */
export function resetFlagValuesKeys(): void {
  publicKey.reset();
}

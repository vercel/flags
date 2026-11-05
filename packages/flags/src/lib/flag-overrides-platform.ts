import type { FlagOverridesType } from '../types';
import {
  isRecord,
  isVercelSignedToken,
  resetVercelSignedTokenKeys,
  verifyVercelSignedToken,
} from './vercel-platform';

/**
 * The issuer of the Vercel Toolbar in Vercel KMS, which signs the flag
 * overrides.
 *
 * @internal
 */
export const VERCEL_FLAG_OVERRIDES_ISSUER =
  'https://kms.vercel.com/64af96a2-ba60-42ef-91af-459fcef6f864';

/**
 * Where the public keys of Vercel for the flag overrides are.
 *
 * @internal
 */
export const VERCEL_FLAG_OVERRIDES_JWKS_URL = `${VERCEL_FLAG_OVERRIDES_ISSUER}/jwks.json`;

/**
 * The rules for flag overrides which are signed by the platform. They are
 * part of the protocol.
 *
 * @internal
 */
export const FLAG_OVERRIDES_POLICY = Object.freeze({
  algorithm: 'ES256',
  audience: 'vercel:flag-overrides',
  purpose: 'flag-overrides',
  version: 1,
  maxLifetimeSeconds: 7 * 24 * 60 * 60,
  clockToleranceSeconds: 5,
  maxTokenLength: 16_384,
});

/**
 * Whether the flag overrides are signed by the platform (a JWS, which has
 * three parts) and the host can verify them: on Vercel, or locally after
 * `vercel env pull`.
 */
export function isFlagOverridesFromPlatform(token: string): boolean {
  return isVercelSignedToken(token);
}

/**
 * Verifies flag overrides which the Vercel Toolbar signed with Vercel KMS, so
 * the host can accept them without a `FLAGS_SECRET`. Returns `undefined` for
 * a token which is not valid, or not for the project and environment of the
 * host.
 */
export async function verifyFlagOverridesFromPlatform(
  token: string,
): Promise<FlagOverridesType | undefined> {
  const payload = await verifyVercelSignedToken(
    token,
    VERCEL_FLAG_OVERRIDES_ISSUER,
    FLAG_OVERRIDES_POLICY,
  );
  return payload && isRecord(payload.overrides)
    ? (payload.overrides as FlagOverridesType)
    : undefined;
}

/**
 * Only for tests.
 *
 * @internal
 */
export function resetFlagOverridesKeys(): void {
  resetVercelSignedTokenKeys();
}

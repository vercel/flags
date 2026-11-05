import {
  createLocalJWKSet,
  decodeProtectedHeader,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
  jwtVerify,
} from 'jose';
import type { FlagOverridesType } from '../types';
import {
  createKeySetCache,
  findVercelProject,
  isRecord,
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
  return (
    Boolean(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN) &&
    token.split('.').length === 3
  );
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
  const policy = FLAG_OVERRIDES_POLICY;
  // The project comes from the host, never from the token
  const { projectId, environment, teamId } = findVercelProject();
  if (!projectId || !environment || token.length > policy.maxTokenLength) {
    return undefined;
  }

  try {
    const header = decodeProtectedHeader(token);
    // Keys or URLs in the token never select which keys are trusted
    if (
      typeof header.kid !== 'string' ||
      !header.kid ||
      ['jku', 'jwk', 'x5u', 'crit'].some((name) => Object.hasOwn(header, name))
    ) {
      return undefined;
    }

    const { payload } = await jwtVerify(token, getPublicKey, {
      algorithms: [policy.algorithm],
      issuer: VERCEL_FLAG_OVERRIDES_ISSUER,
      audience: policy.audience,
      requiredClaims: ['iat', 'exp'],
      clockTolerance: policy.clockToleranceSeconds,
      maxTokenAge: policy.maxLifetimeSeconds,
    });

    if (
      (payload.exp as number) - (payload.iat as number) >
        policy.maxLifetimeSeconds ||
      payload.pur !== policy.purpose ||
      payload.ver !== policy.version ||
      !isRecord(payload.overrides) ||
      !isInScope(payload.scope, { projectId, environment, teamId })
    ) {
      return undefined;
    }
    return payload.overrides as FlagOverridesType;
  } catch {
    return undefined;
  }
}

function isInScope(
  scope: unknown,
  host: { projectId: string; environment: string; teamId?: string },
): boolean {
  if (!isRecord(scope)) return false;
  // An unknown key could restrict the scope in a way this SDK can not check
  if (
    Object.keys(scope).some(
      (key) => !['teamId', 'projectIds', 'environments'].includes(key),
    )
  ) {
    return false;
  }
  return (
    // All projects of a microfrontends group share the cookie
    Array.isArray(scope.projectIds) &&
    scope.projectIds.includes(host.projectId) &&
    (host.teamId === undefined || scope.teamId === host.teamId) &&
    Array.isArray(scope.environments) &&
    scope.environments.includes(host.environment)
  );
}

const publicKeys = createKeySetCache(
  VERCEL_FLAG_OVERRIDES_JWKS_URL,
  'the public keys for the flag overrides',
  (keySet) => createLocalJWKSet(keySet as unknown as JSONWebKeySet),
);

const getPublicKey: JWTVerifyGetKey = async (header, token) => {
  try {
    return await (await publicKeys.get())(header, token);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ERR_JWKS_NO_MATCHING_KEY') {
      throw error;
    }
    // A new key, e.g. after a rotation
    return (await publicKeys.get({ refresh: true }))(header, token);
  }
};

/**
 * Only for tests.
 *
 * @internal
 */
export function resetFlagOverridesKeys(): void {
  publicKeys.reset();
}

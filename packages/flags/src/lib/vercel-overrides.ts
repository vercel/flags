/**
 * Flag overrides which the Vercel Toolbar signs with Vercel KMS, so an
 * application on Vercel can accept them without a `FLAGS_SECRET`.
 */
import {
  createLocalJWKSet,
  decodeProtectedHeader,
  type JSONWebKeySet,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from 'jose';
import type { FlagOverridesType } from '../types';
import {
  createKeySetCache,
  findVercelProject,
  isRecord,
  type KeySetCache,
} from './vercel-platform';

/**
 * The `flags-explorer-issuer`, which signs the overrides.
 */
const OVERRIDES_ISSUER =
  'https://kms.vercel.com/64af96a2-ba60-42ef-91af-459fcef6f864';
/**
 * The `flags-keys-issuer`, which signs the tokens of the Flags Discovery
 * Endpoint.
 *
 * TODO(flags-keys-issuer): replace the placeholder with the id of the issuer
 * once it exists. The placeholder is not a valid issuer, so no token verifies
 * against it and its keys are never loaded (fail closed).
 *
 * @internal
 */
export const FLAGS_KEYS_ISSUER =
  'https://kms.vercel.com/TODO-flags-keys-issuer';
/**
 * An issuer of Vercel KMS. Any other value, e.g. a placeholder, never verifies.
 */
const KMS_ISSUER_PATTERN =
  /^https:\/\/kms\.vercel\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const AUDIENCE = 'vercel:flag-overrides';
const PURPOSE = 'flag-overrides';
const VERSION = 1;
const MAX_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const CLOCK_TOLERANCE_SECONDS = 5;
const MAX_TOKEN_LENGTH = 16_384;

/**
 * Whether the token is signed by Vercel (a JWS, which has three parts) and the
 * application can verify it: on Vercel, or locally after `vercel env pull`.
 */
export function isVercelSignedToken(token: string): boolean {
  return (
    Boolean(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN) &&
    token.split('.').length === 3
  );
}

/**
 * Verifies a token which Vercel signed. Returns `undefined` for a token which
 * is not valid, or not for this project and environment.
 */
export async function verifyVercelSignedOverrides(
  token: string,
): Promise<FlagOverridesType | undefined> {
  const payload = await verifyVercelSignedToken(token, {
    issuer: OVERRIDES_ISSUER,
    audience: AUDIENCE,
    purpose: PURPOSE,
    maxLifetimeSeconds: MAX_LIFETIME_SECONDS,
  });
  return payload && isRecord(payload.overrides)
    ? (payload.overrides as FlagOverridesType)
    : undefined;
}

/**
 * Verifies a token which the issuer signed for the given audience and purpose.
 * Returns `undefined` for a token which is not valid, or not for this project
 * and environment.
 *
 * @internal
 */
export async function verifyVercelSignedToken(
  token: string,
  options: {
    issuer: string;
    audience: string;
    purpose: string;
    maxLifetimeSeconds: number;
  },
): Promise<JWTPayload | undefined> {
  const project = getProject();
  if (
    !project ||
    token.length > MAX_TOKEN_LENGTH ||
    !KMS_ISSUER_PATTERN.test(options.issuer)
  ) {
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

    const { payload } = await jwtVerify(token, getKey(options.issuer), {
      algorithms: ['ES256'],
      issuer: options.issuer,
      audience: options.audience,
      requiredClaims: ['iat', 'exp'],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      maxTokenAge: options.maxLifetimeSeconds,
    });

    if (
      (payload.exp as number) - (payload.iat as number) >
        options.maxLifetimeSeconds ||
      payload.pur !== options.purpose ||
      payload.ver !== VERSION ||
      !isInScope(payload.scope, project)
    ) {
      return undefined;
    }
    return payload;
  } catch {
    return undefined;
  }
}

interface Project {
  projectId: string;
  environment: string;
  teamId?: string;
}

/**
 * The project comes from the host, never from the token.
 */
function getProject(): Project | undefined {
  const { projectId, environment, teamId } = findVercelProject();
  if (!projectId || !environment) return undefined;
  return { projectId, environment, teamId };
}

/**
 * The team is only checked when it is known, which needs a `VERCEL_OIDC_TOKEN`
 * in the environment, e.g. after `vercel env pull`. A deployment has no such
 * variable at runtime (the token is only a header of each request), and none
 * of the system environment variables of Vercel contains the team, so a
 * deployment can not check the team. The project id is unique across all
 * teams, so the project and the environment still bind the token to it.
 */
function isInScope(scope: unknown, project: Project): boolean {
  if (!isRecord(scope)) return false;
  // An unknown key could restrict the scope in a way this SDK can not check
  if (
    Object.keys(scope).some(
      (key) => !['teamId', 'projectId', 'environments'].includes(key),
    )
  ) {
    return false;
  }
  return (
    scope.projectId === project.projectId &&
    (project.teamId === undefined || scope.teamId === project.teamId) &&
    Array.isArray(scope.environments) &&
    scope.environments.includes(project.environment)
  );
}

/**
 * One key set for each issuer, so the keys of one issuer never verify a token
 * of another.
 */
const keySets = new Map<string, KeySetCache<JWTVerifyGetKey>>();

function getKey(issuer: string): JWTVerifyGetKey {
  const keys =
    keySets.get(issuer) ??
    createKeySetCache(
      `${issuer}/jwks.json`,
      'the public keys of Vercel KMS',
      (keySet) => createLocalJWKSet(keySet as unknown as JSONWebKeySet),
    );
  keySets.set(issuer, keys);
  return async (header, token) => {
    try {
      return await (await keys.get())(header, token);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ERR_JWKS_NO_MATCHING_KEY') {
        throw error;
      }
      // A new key, e.g. after a rotation
      return (await keys.get({ refresh: true }))(header, token);
    }
  };
}

/**
 * @internal For tests only.
 */
export function resetVercelKeys(): void {
  keySets.clear();
}

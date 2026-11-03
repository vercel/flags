/**
 * Flag overrides which the Vercel Toolbar signs with Vercel KMS, so an
 * application on Vercel can accept them without a `FLAGS_SECRET`.
 */
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

const ISSUER = 'https://kms.vercel.com/64af96a2-ba60-42ef-91af-459fcef6f864';
const JWKS_URL = `${ISSUER}/jwks.json`;
const AUDIENCE = 'vercel:flag-overrides';
const PURPOSE = 'flag-overrides';
const VERSION = 1;
const MAX_LIFETIME_SECONDS = 24 * 60 * 60;
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
  const project = getProject();
  if (!project || token.length > MAX_TOKEN_LENGTH) return undefined;

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

    const { payload } = await jwtVerify(token, getKey, {
      algorithms: ['ES256'],
      issuer: ISSUER,
      audience: AUDIENCE,
      requiredClaims: ['iat', 'exp'],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      maxTokenAge: MAX_LIFETIME_SECONDS,
    });

    if (
      (payload.exp as number) - (payload.iat as number) >
        MAX_LIFETIME_SECONDS ||
      payload.pur !== PURPOSE ||
      payload.ver !== VERSION ||
      !isRecord(payload.overrides) ||
      !isInScope(payload.scope, project)
    ) {
      return undefined;
    }
    return payload.overrides as FlagOverridesType;
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

const keys = createKeySetCache(
  JWKS_URL,
  'the public keys for the overrides',
  (keySet) => createLocalJWKSet(keySet as unknown as JSONWebKeySet),
);

const getKey: JWTVerifyGetKey = async (header, token) => {
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

/**
 * @internal For tests only.
 */
export function resetVercelKeys(): void {
  keys.reset();
}

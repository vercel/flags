import type { FlagOverridesType } from '../types';
import {
  findVercelProject,
  isRecord,
  isVercelSignedToken,
  readOidcToken,
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
 * Signs flag overrides with Vercel KMS, so a host without a `FLAGS_SECRET`
 * accepts them in the `vercel-flag-overrides` cookie.
 *
 * Vercel signs them for the project and the environment of the OIDC token of
 * the host: of the request on a deployment, or the `VERCEL_OIDC_TOKEN` of
 * `vercel env pull`. The caller decides who gets the token: with it, a
 * visitor overrides the flags of that project and environment.
 *
 * With a `token`, e.g. a Vercel access token, Vercel signs them for any
 * project and environment which the token can access.
 *
 * @param overrides - The flag overrides to sign
 * @param options.ttl - The lifetime of the token in seconds (defaults to 1 hour, at most 1 day)
 * @param options.token - The token which authorizes the request (defaults to the OIDC token of the host)
 * @param options.projectId - The project to sign for (defaults to the project of the host)
 * @param options.environment - The environment to sign for (defaults to the environment of the OIDC token)
 * @param options.teamId - The team of the project, which an access token needs
 * @returns A promise resolving to the signed JWS string
 * @throws Error if there is no token or project, or Vercel does not sign the overrides
 */
export async function signOverrides(
  overrides: FlagOverridesType,
  options: {
    ttl?: number;
    token?: string;
    projectId?: string;
    environment?: string;
    teamId?: string;
  } = {},
): Promise<string> {
  const token = options.token ?? readOidcToken();
  const projectId = options.projectId ?? findVercelProject().projectId;
  if (!token || !projectId) {
    throw new Error(
      'flags: Could not sign the overrides, because the OIDC token or the project of this host is not known. Run `vercel env pull` for local development. On Vercel, call it during a request. Or pass a `token` and a `projectId`.',
    );
  }
  const query = options.teamId
    ? `?teamId=${encodeURIComponent(options.teamId)}`
    : '';
  // Read the global fetch at each call, because a framework can replace it.
  const response = await globalThis.fetch(
    `https://api.vercel.com/v1/projects/${encodeURIComponent(projectId)}/feature-flags/overrides/sign${query}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        overrides,
        ttl: options.ttl,
        environment: options.environment,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(SIGN_TIMEOUT_MS),
    },
  );
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !isRecord(data) || typeof data.token !== 'string') {
    // The reason of Vercel, e.g. an environment which the project does not have
    const reason =
      isRecord(data) && isRecord(data.error) ? data.error.message : undefined;
    throw new Error(
      `flags: Could not sign the overrides: status ${response.status}${
        typeof reason === 'string' ? ` (${reason})` : ''
      }.`,
    );
  }
  return data.token;
}

const SIGN_TIMEOUT_MS = 10_000;

/**
 * Only for tests.
 *
 * @internal
 */
export function resetFlagOverridesKeys(): void {
  resetVercelSignedTokenKeys();
}

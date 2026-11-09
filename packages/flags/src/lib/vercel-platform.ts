import {
  createLocalJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  type JSONWebKeySet,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from 'jose';

/**
 * The Vercel project of the host. A part which is not known is `undefined`.
 */
export interface VercelProject {
  readonly projectId?: string;
  /**
   * E.g. `production`, `preview` or `development`.
   */
  readonly environment?: string;
  readonly teamId?: string;
}

/**
 * Finds the Vercel project of the host: the environment of a deployment, the
 * `VERCEL_OIDC_TOKEN` of `vercel env pull`, and the `.vercel/project.json` of
 * `vercel link`, in this order. An empty environment variable counts as
 * missing.
 *
 * @internal
 */
export function findVercelProject(): VercelProject {
  const env = process.env;
  const oidc = readOidcClaims();
  return {
    projectId: env.VERCEL_PROJECT_ID || oidc.projectId || readLinkedProjectId(),
    environment: env.VERCEL_TARGET_ENV || env.VERCEL_ENV || oidc.environment,
    teamId: oidc.teamId,
  };
}

/**
 * The token is only decoded, not verified: it is configuration of the host,
 * like the other environment variables, not an input of a request.
 */
function readOidcClaims(): VercelProject {
  const token = process.env.VERCEL_OIDC_TOKEN;
  if (!token) return {};
  try {
    const claims = decodeJwt(token);
    const text = (value: unknown) =>
      typeof value === 'string' && value ? value : undefined;
    return {
      projectId: text(claims.project_id),
      environment: text(claims.environment),
      teamId: text(claims.owner_id),
    };
  } catch {
    return {};
  }
}

function readLinkedProjectId(): string | undefined {
  // getBuiltinModule needs no import, so runtimes other than Node.js work
  const fs = process.getBuiltinModule?.('node:fs');
  if (!fs) return undefined;
  try {
    const data: unknown = JSON.parse(
      fs.readFileSync(`${process.cwd()}/.vercel/project.json`, 'utf8'),
    );
    return isRecord(data) && typeof data.projectId === 'string'
      ? data.projectId || undefined
      : undefined;
  } catch {
    return undefined;
  }
}

const KEY_SET_POLICY = Object.freeze({
  cacheMaxAgeMs: 300_000,
  cooldownMs: 30_000,
  maxKeySetBytes: 65_536,
  maxKeys: 100,
});

/**
 * A key set of Vercel which is kept in memory, so the keys are not loaded for
 * each request.
 */
export interface KeySetCache<T> {
  /**
   * Returns the keys. Loads them on the first use, after five minutes, and
   * with `refresh` (e.g. for a key which is not known) when they are older
   * than the cooldown of 30 seconds.
   */
  get(options?: { refresh?: boolean }): Promise<T>;
  reset(): void;
}

/**
 * Creates a cache for the public key set at `url`. `parse` turns the valid
 * key set into the keys which the caller needs.
 *
 * Concurrent loads share one request. After an error, it throws the same
 * error until the cooldown ends, so that a missing key set does not cause one
 * request for each page. A failed reload keeps the keys which it has.
 *
 * @internal
 */
export function createKeySetCache<T>(
  url: string,
  description: string,
  parse: (keySet: { keys: Record<string, unknown>[] }) => T | Promise<T>,
): KeySetCache<T> {
  const policy = KEY_SET_POLICY;
  let value: T | undefined;
  let loadedAt = Number.NEGATIVE_INFINITY;
  let pending: Promise<T> | undefined;
  let error: Error | undefined;
  let failedAt = Number.NEGATIVE_INFINITY;

  async function load(): Promise<T> {
    try {
      // Read the global fetch at each load, because a framework can replace
      // it. no-store, so a framework which caches fetch never keeps old keys.
      const response = await globalThis.fetch(url, {
        redirect: 'error',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const data: unknown = JSON.parse(
        await readLimited(response, policy.maxKeySetBytes),
      );
      if (
        !isRecord(data) ||
        !Array.isArray(data.keys) ||
        data.keys.length > policy.maxKeys ||
        // A public key set must not contain private or secret keys
        !data.keys.every(
          (key) => isRecord(key) && !('d' in key) && !('k' in key),
        )
      ) {
        throw new Error('the key set is not valid');
      }
      value = await parse(data as { keys: Record<string, unknown>[] });
      loadedAt = Date.now();
      error = undefined;
      return value;
    } catch (cause) {
      error = new Error(
        `flags: Could not load ${description} from ${url}: ${
          cause instanceof Error ? cause.message : String(cause)
        }.`,
        { cause },
      );
      failedAt = Date.now();
      if (value !== undefined) return value;
      throw error;
    }
  }

  return {
    get({ refresh = false } = {}) {
      const now = Date.now();
      const maxAge = refresh ? policy.cooldownMs : policy.cacheMaxAgeMs;
      if (value !== undefined && now - loadedAt < maxAge) {
        return Promise.resolve(value);
      }
      if (now - failedAt < policy.cooldownMs) {
        return value !== undefined
          ? Promise.resolve(value)
          : Promise.reject(error);
      }
      pending ??= load().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    reset() {
      value = undefined;
      loadedAt = Number.NEGATIVE_INFINITY;
      pending = undefined;
      error = undefined;
      failedAt = Number.NEGATIVE_INFINITY;
    },
  };
}

/**
 * Reads the body in chunks, and stops when it is larger than the limit.
 */
async function readLimited(response: Response, maxBytes: number) {
  if (!response.body) throw new Error('the key set is empty');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('the key set is too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * @internal
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The rules for a token which Vercel KMS signs. They are part of the
 * protocol.
 */
export interface SignedTokenPolicy {
  readonly algorithm: string;
  readonly audience: string;
  readonly purpose: string;
  readonly version: number;
  readonly maxLifetimeSeconds: number;
  readonly clockToleranceSeconds: number;
  readonly maxTokenLength: number;
}

/**
 * An issuer of Vercel KMS. Any other value, e.g. a placeholder, never verifies.
 */
const KMS_ISSUER_PATTERN =
  /^https:\/\/kms\.vercel\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Whether the token is signed by Vercel (a JWS, which has three parts) and the
 * host can verify it: on Vercel, or locally after `vercel env pull`.
 *
 * @internal
 */
export function isVercelSignedToken(token: string): boolean {
  return (
    Boolean(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN) &&
    token.split('.').length === 3
  );
}

/**
 * Verifies a token which the issuer signed with the rules of the policy.
 * Returns `undefined` for a token which is not valid, or not for the project
 * and environment of the host.
 *
 * @internal
 */
export async function verifyVercelSignedToken(
  token: string,
  issuer: string,
  policy: SignedTokenPolicy,
): Promise<JWTPayload | undefined> {
  // The project comes from the host, never from the token
  const { projectId, environment, teamId } = findVercelProject();
  if (
    !projectId ||
    !environment ||
    token.length > policy.maxTokenLength ||
    !KMS_ISSUER_PATTERN.test(issuer)
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

    const { payload } = await jwtVerify(token, getPublicKey(issuer), {
      algorithms: [policy.algorithm],
      issuer,
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
      !isInScope(payload.scope, { projectId, environment, teamId })
    ) {
      return undefined;
    }
    return payload;
  } catch {
    return undefined;
  }
}

/**
 * The team is only checked when it is known, which needs a `VERCEL_OIDC_TOKEN`
 * in the environment, e.g. after `vercel env pull`. A deployment has no such
 * variable at runtime (the token is only a header of each request), and none
 * of the system environment variables of Vercel contains the team, so a
 * deployment can not check the team. The project id is unique across all
 * teams, so the project and the environment still bind the token to it.
 */
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

/**
 * The public keys of each issuer, so the keys of one issuer never verify a
 * token of another.
 */
const publicKeys = new Map<string, KeySetCache<JWTVerifyGetKey>>();

function getPublicKey(issuer: string): JWTVerifyGetKey {
  const keys =
    publicKeys.get(issuer) ??
    createKeySetCache(
      `${issuer}/jwks.json`,
      'the public keys of Vercel KMS',
      (keySet) => createLocalJWKSet(keySet as unknown as JSONWebKeySet),
    );
  publicKeys.set(issuer, keys);
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
 * Only for tests.
 *
 * @internal
 */
export function resetVercelSignedTokenKeys(): void {
  publicKeys.clear();
}

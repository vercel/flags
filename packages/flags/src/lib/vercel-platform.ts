import {
  createLocalJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  type JSONWebKeySet,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from 'jose';

type Env = Record<string, string | undefined>;

let frameworkEnv: Env | undefined;

/**
 * Adds environment variables which are not in `process.env`. E.g. SvelteKit
 * has the variables of `.env.local` only in `$env` during `vite dev`. A
 * variable of `process.env` has priority.
 *
 * @internal
 */
export function addEnv(env: Env): void {
  frameworkEnv = env;
}

/**
 * Reads an environment variable of the host. An empty variable counts as
 * missing. A runtime with no `process` global has no variables.
 *
 * @internal
 */
export function readEnv(name: string): string | undefined {
  return globalThis.process?.env?.[name] || frameworkEnv?.[name] || undefined;
}

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
 * OIDC token (of the request, or the `VERCEL_OIDC_TOKEN` of
 * `vercel env pull`), and the `.vercel/project.json` of `vercel link`, in this
 * order.
 *
 * @internal
 */
export function findVercelProject(): VercelProject {
  const oidc = readOidcClaims();
  return {
    projectId:
      readEnv('VERCEL_PROJECT_ID') || oidc.projectId || readLinkedProjectId(),
    environment:
      readEnv('VERCEL_TARGET_ENV') || readEnv('VERCEL_ENV') || oidc.environment,
    teamId: oidc.teamId,
  };
}

let oidc: { token: string; claims: VercelProject } | undefined;

/**
 * Reads the OIDC token of the host: on a deployment, Vercel adds it to each
 * request as the `x-vercel-oidc-token` header; `vercel env pull` and a build
 * have it as `VERCEL_OIDC_TOKEN`. The header has priority, like in
 * `@vercel/oidc`.
 */
function readOidcToken(): string | undefined {
  try {
    const context = Reflect.get(
      globalThis,
      Symbol.for('@vercel/request-context'),
    )?.get?.();
    const token: unknown = context?.headers?.['x-vercel-oidc-token'];
    if (typeof token === 'string' && token) {
      return token;
    }
  } catch {
    // No request context
  }
  return readEnv('VERCEL_OIDC_TOKEN');
}

/**
 * The token is only decoded, not verified: it is configuration of the host,
 * which the platform sets, like the other environment variables. It is
 * decoded one time for each token, not for each call.
 */
function readOidcClaims(): VercelProject {
  const token = readOidcToken();
  if (!token) {
    return {};
  }
  if (oidc?.token !== token) {
    oidc = { token, claims: decodeOidcClaims(token) };
  }
  return oidc.claims;
}

function decodeOidcClaims(token: string): VercelProject {
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

let linked: { path: string; projectId: string | undefined } | undefined;

/**
 * The file is read one time for each working directory, not for each call.
 */
function readLinkedProjectId(): string | undefined {
  // No direct use of `process`, so a build for the Edge Runtime has no
  // warnings. getBuiltinModule needs no import, so runtimes other than Node.js
  // work.
  const proc = globalThis.process;
  const fs = proc?.getBuiltinModule?.('node:fs');
  if (!fs) {
    return undefined;
  }
  const path = `${proc.cwd()}/.vercel/project.json`;
  if (linked?.path !== path) {
    linked = { path, projectId: parseLinkedProjectId(fs, path) };
  }
  return linked.projectId;
}

function parseLinkedProjectId(
  fs: typeof import('node:fs'),
  path: string,
): string | undefined {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(path, 'utf8'));
    return isRecord(data) && typeof data.projectId === 'string'
      ? data.projectId || undefined
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The key set did not load.
 */
class KeySetError extends Error {}

const KEY_SET_POLICY = Object.freeze({
  cacheMaxAgeMs: 300_000,
  cooldownMs: 30_000,
  timeoutMs: 5_000,
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
 * Concurrent loads share one request, which stops after a timeout of five
 * seconds. After an error, it throws the same error until the cooldown ends,
 * so that a missing key set does not cause one request for each page. A failed
 * reload keeps the keys which it has.
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
        // A key host which does not respond must not block the requests
        signal: AbortSignal.timeout(policy.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
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
      // A framework can throw an error to control the render, e.g. Next.js
      // to make a static page dynamic. It has a digest, and it is not a
      // failure of the key host.
      if (cause instanceof Error && 'digest' in cause) {
        throw cause;
      }
      error = new KeySetError(
        `flags: Could not load ${description} from ${url}: ${
          cause instanceof Error ? cause.message : String(cause)
        }.`,
        { cause },
      );
      failedAt = Date.now();
      if (value !== undefined) {
        return value;
      }
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
  if (!response.body) {
    throw new Error('the key set is empty');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) {
        throw new Error('the key set is too large');
      }
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

const warnedAt = new Map<string, number>();

/**
 * Logs a warning, at most one time per cooldown for each message, so that a
 * problem which occurs for each request does not fill the logs.
 *
 * @internal
 */
export function warnWithCooldown(message: string): void {
  const now = Date.now();
  const last = warnedAt.get(message) ?? Number.NEGATIVE_INFINITY;
  if (now - last < KEY_SET_POLICY.cooldownMs) {
    return;
  }
  warnedAt.set(message, now);
  console.warn(message);
}

/**
 * Only for tests.
 *
 * @internal
 */
export function resetWarnings(): void {
  warnedAt.clear();
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
 * Whether the host can verify tokens which Vercel signs: on Vercel, or locally
 * after `vercel env pull`.
 *
 * @internal
 */
export function canVerifyVercelSignedTokens(): boolean {
  return Boolean(readEnv('VERCEL') || readEnv('VERCEL_OIDC_TOKEN'));
}

/**
 * Whether the token is signed by Vercel (a JWS, which has three parts) and the
 * host can verify it. Warns about a signed token which the host can not
 * verify, because such a token is ignored.
 *
 * @internal
 */
export function isVercelSignedToken(token: string): boolean {
  if (token.split('.').length !== 3) {
    return false;
  }
  if (!canVerifyVercelSignedTokens()) {
    warnWithCooldown(
      'flags: Ignored a token which Vercel signed, because this host can not verify it. Run `vercel env pull` for local development. On Vercel, expose the system environment variables of the project.',
    );
    return false;
  }
  return true;
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
  if (!projectId || !environment) {
    warnWithCooldown(
      'flags: Ignored a token which Vercel signed, because the project or the environment of this host is not known. Run `vercel env pull` for local development. On Vercel, expose the system environment variables of the project.',
    );
    return undefined;
  }
  if (
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
      payload.ver !== policy.version
    ) {
      return undefined;
    }
    if (!isInScope(payload.scope, { projectId, environment, teamId })) {
      // The signature is valid, so the token is from Vercel
      warnWithCooldown(
        `flags: Ignored a token which Vercel signed, because it is not for the project ${projectId} and the environment ${environment} of this host.`,
      );
      return undefined;
    }
    return payload;
  } catch (error) {
    if (error instanceof KeySetError) {
      warnWithCooldown(
        `${error.message} A token which Vercel signed is ignored.`,
      );
    }
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
  if (!isRecord(scope)) {
    return false;
  }
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
  let keys = publicKeys.get(issuer);
  if (!keys) {
    keys = createKeySetCache(
      `${issuer}/jwks.json`,
      'the public keys of Vercel KMS',
      (keySet) => createLocalJWKSet(keySet as unknown as JSONWebKeySet),
    );
    publicKeys.set(issuer, keys);
  }
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

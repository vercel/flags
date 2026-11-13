import { decodeJwt } from 'jose';

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
 * which the platform sets, like the other environment variables. A visitor
 * can not set it: Vercel removes an `x-vercel-oidc-token` header from each
 * incoming request, and only adds its own. It is decoded one time for each
 * token, not for each call.
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

const KEY_SET_POLICY = Object.freeze({
  cacheMaxAgeMs: 300_000,
  staleMaxAgeMs: 600_000,
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
   * than the cooldown of 30 seconds. After five minutes, it returns the keys
   * which it has, and loads the new ones for the next call. After ten minutes
   * (e.g. an instance with no requests), it waits for the new keys, so a
   * revoked key is not used long after its revocation.
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
      // no-store, so a framework which caches fetch never keeps old keys
      const response = await getFetch()(url, {
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
      error = new Error(
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
      if (
        value !== undefined &&
        !refresh &&
        now - loadedAt < policy.staleMaxAgeMs
      ) {
        // A reload must not block the request
        pending.catch(() => {});
        return Promise.resolve(value);
      }
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
 * The fetch which loads the keys. Read at each load, because a framework can
 * replace the global fetch.
 *
 * Next.js replaces it with a fetch which tracks the data of a page: a request
 * with no-store makes a static page dynamic, and fails the build of a page
 * with `dynamic = 'error'`. The keys are not data of the page, and this cache
 * keeps them fresh, so they are loaded with the fetch of the runtime, which
 * Next.js keeps as `_nextOriginalFetch`.
 */
function getFetch(): typeof globalThis.fetch {
  const fetch: typeof globalThis.fetch & {
    _nextOriginalFetch?: typeof globalThis.fetch;
  } = globalThis.fetch;
  return fetch._nextOriginalFetch ?? fetch;
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

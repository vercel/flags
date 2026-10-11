import {
  createLocalJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  type JSONWebKeySet,
  type JWTPayload,
  jwtVerify,
} from 'jose';
import type { FlagOverrides } from './shared-secret';
import type { JsonValue, OverrideRejection } from './types';

/**
 * The project, which must be in the scope of a signed override token. It
 * comes from the configuration of the host, never from the token.
 */
export interface PlatformProject {
  readonly projectId: string;
  /**
   * E.g. `production`, `preview` or `development`.
   */
  readonly environment: string;
  /**
   * Compared only if it is known. A project ID is unique on all of Vercel,
   * so the project ID and the environment identify the host.
   */
  readonly teamId?: string;
}

export interface VercelOverridesOptions {
  /**
   * The trusted issuer of the tokens. Must use HTTPS. The default is the
   * issuer of the Vercel Toolbar.
   */
  readonly issuer?: string;
  /**
   * Where the public keys of the issuer are. Must use HTTPS. The default is
   * `<issuer>/jwks.json`.
   */
  readonly jwksUrl?: string;
  /**
   * The default comes from the environment: on Vercel from
   * `VERCEL_PROJECT_ID` and `VERCEL_TARGET_ENV`, locally from the
   * `VERCEL_OIDC_TOKEN` of `vercel env pull`, or from the
   * `.vercel/project.json` of `vercel link`.
   */
  readonly project?: Partial<PlatformProject>;
  /**
   * The maximum lifetime of a token in seconds. The default is 24 hours.
   */
  readonly maxLifetimeSeconds?: number;
  /**
   * How long the public keys stay valid in the cache. The default is
   * 5 minutes.
   */
  readonly cacheMaxAgeMs?: number;
  /**
   * The minimum time between two loads for a key which is not known. The
   * default is 30 seconds.
   */
  readonly cooldownMs?: number;
  /**
   * Allows `http://localhost` for the issuer and the keys. Only for a local
   * test issuer.
   */
  readonly allowInsecureLocalhost?: boolean;
  /**
   * The `fetch` function which loads the public keys. The default is the
   * global `fetch`.
   */
  readonly fetch?: typeof fetch;
}

/**
 * The issuer of the Vercel Toolbar in Vercel KMS. Its public keys are at
 * `<issuer>/jwks.json`.
 *
 * TEMPORARY: This is a test issuer of the team testing-internal. Replace it
 * with the real issuer before publishing. `prepublishOnly` stops a publish
 * while this value is here.
 *
 * @internal
 */
export const VERCEL_TOOLBAR_ISSUER =
  'https://kms.vercel.com/e97b43ed-736f-40db-808a-eec9b59d9f5e';

/**
 * The rules for signed override tokens. They are part of the protocol, see
 * the spec.
 *
 * @internal
 */
export const SIGNED_OVERRIDES_POLICY = Object.freeze({
  algorithms: Object.freeze(['ES256', 'RS512'] as const),
  audience: 'vercel:flag-overrides',
  purpose: 'flag-overrides',
  version: 1,
  maxLifetimeSeconds: 24 * 60 * 60,
  clockToleranceSeconds: 5,
  cooldownMs: 30_000,
  cacheMaxAgeMs: 300_000,
  maxKeySetBytes: 65_536,
  maxKeys: 100,
});

export type VerifyResult =
  | { readonly overrides: FlagOverrides }
  | { readonly rejection: OverrideRejection };

/**
 * Thrown when the SDK can not verify signed tokens at all, e.g. because the
 * public keys can not be loaded. Overrides are a tool for development, so the
 * error is visible instead of silent.
 */
export class OverridesError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`flags: ${message}`, options);
    this.name = 'OverridesError';
  }
}

/**
 * Creates a function which verifies signed override tokens. Validates the
 * options at once, and loads the public keys only when a token needs them.
 *
 * @internal
 */
export function createVercelVerifier(
  options: VercelOverridesOptions = {},
  now: () => number = Date.now,
): (token: string) => Promise<VerifyResult> {
  const policy = SIGNED_OVERRIDES_POLICY;
  const issuer = options.issuer ?? VERCEL_TOOLBAR_ISSUER;
  parseTrustedUrl(issuer, options, 'issuer');
  const jwksUrl = parseTrustedUrl(
    options.jwksUrl ?? `${issuer.replace(/\/$/, '')}/jwks.json`,
    options,
    'jwksUrl',
  );
  const project = resolveProject(options.project);
  const maxLifetime = positive(
    options.maxLifetimeSeconds ?? policy.maxLifetimeSeconds,
    'maxLifetimeSeconds',
  );
  const keys = createKeyCache(jwksUrl, options, now);

  return async (token) => {
    let header: ReturnType<typeof decodeProtectedHeader>;
    try {
      header = decodeProtectedHeader(token);
    } catch {
      return { rejection: 'malformed-token' };
    }
    if (!(policy.algorithms as readonly string[]).includes(header.alg ?? '')) {
      return { rejection: 'unsupported-algorithm' };
    }
    // Keys or URLs in the token never select which keys are trusted
    if (
      typeof header.kid !== 'string' ||
      !header.kid ||
      header.kid.length > 256 ||
      header.jku ||
      header.jwk ||
      header.x5u ||
      header.crit
    ) {
      return { rejection: 'malformed-token' };
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, keys.resolve, {
        algorithms: [...policy.algorithms],
        issuer,
        audience: policy.audience,
        requiredClaims: ['iat', 'exp'],
        clockTolerance: policy.clockToleranceSeconds,
        currentDate: new Date(now()),
      }));
    } catch (error) {
      if (error instanceof OverridesError) throw error;
      if (error instanceof UnknownKeyError) return { rejection: 'unknown-key' };
      const code = (error as { code?: string }).code;
      if (code === 'ERR_JWT_EXPIRED') return { rejection: 'expired-token' };
      if (code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
        return { rejection: 'invalid-signature' };
      }
      return { rejection: 'invalid-claims' };
    }

    if (!hasValidClaims(payload, maxLifetime, now)) {
      return { rejection: 'invalid-claims' };
    }
    if (!isInScope(payload.scope, project)) return { rejection: 'wrong-scope' };
    return { overrides: payload.overrides as FlagOverrides };
  };
}

/**
 * Finds the Vercel project of the host: the environment of a deployment, the
 * `VERCEL_OIDC_TOKEN` of `vercel env pull`, and the `.vercel/project.json` of
 * `vercel link`, in this order. A part which is not known is `undefined`.
 *
 * @internal
 */
export function findPlatformProject(): Partial<PlatformProject> {
  const env = process.env;
  const oidc = readOidcClaims();
  const linked = readLinkedProject();
  // An empty environment variable counts as missing
  return {
    projectId: env.VERCEL_PROJECT_ID || oidc?.projectId || linked?.projectId,
    environment:
      env.VERCEL_TARGET_ENV ||
      env.VERCEL_ENV ||
      oidc?.environment ||
      (linked && env.NODE_ENV === 'development' ? 'development' : undefined),
    teamId: oidc?.teamId || linked?.orgId,
  };
}

/**
 * Finds the project of the host, in this order: the options, the environment
 * of a deployment, the `VERCEL_OIDC_TOKEN` of `vercel env pull`, and the
 * `.vercel/project.json` of `vercel link`.
 */
function resolveProject(
  configured: Partial<PlatformProject> = {},
): PlatformProject {
  const found = findPlatformProject();
  const projectId = configured.projectId ?? found.projectId;
  const environment = configured.environment ?? found.environment;
  const teamId = configured.teamId ?? found.teamId;

  if (!projectId?.trim() || !environment?.trim()) {
    throw new OverridesError(
      'The Vercel project for the overrides is not known. Deploy to Vercel, run `vercel env pull`, or set `project` in configureOverrides.',
    );
  }
  return Object.freeze({ projectId, environment, teamId });
}

/**
 * Reads the project from the claims of the OIDC token of Vercel. The token is
 * only decoded, not verified: it is part of the configuration of the host,
 * like the other environment variables, not an input of a request. Its
 * claims stay correct also when it is expired.
 */
function readOidcClaims():
  | {
      readonly projectId?: string;
      readonly environment?: string;
      readonly teamId?: string;
    }
  | undefined {
  const token = process.env.VERCEL_OIDC_TOKEN;
  if (!token) return undefined;
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
    return undefined;
  }
}

function readLinkedProject():
  | { readonly projectId?: string; readonly orgId?: string }
  | undefined {
  // getBuiltinModule needs no import, so runtimes other than Node.js work
  const fs = process.getBuiltinModule?.('node:fs');
  if (!fs) return undefined;
  try {
    const data: unknown = JSON.parse(
      fs.readFileSync(`${process.cwd()}/.vercel/project.json`, 'utf8'),
    );
    if (!isPlainObject(data)) return undefined;
    return {
      projectId:
        typeof data.projectId === 'string' ? data.projectId : undefined,
      orgId: typeof data.orgId === 'string' ? data.orgId : undefined,
    };
  } catch {
    return undefined;
  }
}

function hasValidClaims(
  payload: JWTPayload,
  maxLifetime: number,
  now: () => number,
): boolean {
  const policy = SIGNED_OVERRIDES_POLICY;
  const { iat, exp } = payload;
  return (
    Number.isInteger(iat) &&
    Number.isInteger(exp) &&
    (exp as number) > (iat as number) &&
    (exp as number) - (iat as number) <= maxLifetime &&
    (iat as number) <= now() / 1000 + policy.clockToleranceSeconds &&
    payload.ver === policy.version &&
    payload.pur === policy.purpose &&
    isPlainObject(payload.overrides) &&
    isJson(payload.overrides)
  );
}

function isInScope(scope: unknown, project: PlatformProject): boolean {
  if (!isPlainObject(scope)) return false;
  const allowed = ['teamId', 'projectId', 'environments'];
  if (Object.keys(scope).some((key) => !allowed.includes(key))) return false;
  const { environments } = scope;
  return (
    scope.projectId === project.projectId &&
    (project.teamId === undefined || scope.teamId === project.teamId) &&
    Array.isArray(environments) &&
    environments.length > 0 &&
    environments.every((env) => typeof env === 'string' && env.length > 0) &&
    environments.includes(project.environment)
  );
}

class UnknownKeyError extends Error {}

/**
 * Loads the public keys on the first use, and keeps them for the process.
 * Concurrent loads share one request. If the keys can not be loaded, it
 * throws an `OverridesError`. A key which is not known loads the keys again,
 * but not more often than the cooldown allows.
 */
function createKeyCache(
  url: URL,
  options: VercelOverridesOptions,
  now: () => number,
) {
  const policy = SIGNED_OVERRIDES_POLICY;
  const cooldown = positive(
    options.cooldownMs ?? policy.cooldownMs,
    'cooldownMs',
  );
  const maxAge = positive(
    options.cacheMaxAgeMs ?? policy.cacheMaxAgeMs,
    'cacheMaxAgeMs',
  );
  // Read the global fetch at each request, because a framework can replace
  // it after the cache is created
  const fetchKeys: typeof fetch = (input, init) =>
    (options.fetch ?? globalThis.fetch)(input, init);

  type KeySet = ReturnType<typeof createLocalJWKSet>;
  let keySet: KeySet | undefined;
  let loadedAt = Number.NEGATIVE_INFINITY;
  let pending: Promise<KeySet> | undefined;

  function load(): Promise<KeySet> {
    pending ??= (async () => {
      try {
        const response = await fetchKeys(url, {
          redirect: 'error',
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = JSON.parse(
          await readLimited(response, policy.maxKeySetBytes),
        );
        if (
          !isPlainObject(data) ||
          !Array.isArray(data.keys) ||
          data.keys.length > policy.maxKeys ||
          // A public key set must not contain private or secret keys
          !data.keys.every(
            (key) => isPlainObject(key) && !('d' in key) && !('k' in key),
          )
        ) {
          throw new Error('the key set is not valid');
        }
        keySet = createLocalJWKSet(data as unknown as JSONWebKeySet);
        loadedAt = now();
        return keySet;
      } catch (cause) {
        throw new OverridesError(
          `Could not load the public keys for the overrides from ${url}: ${
            cause instanceof Error ? cause.message : String(cause)
          }.`,
          { cause },
        );
      }
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  }

  const resolve: Parameters<typeof jwtVerify>[1] = async (header, token) => {
    const current = keySet && now() - loadedAt < maxAge ? keySet : await load();
    try {
      return await current(header, token);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ERR_JWKS_NO_MATCHING_KEY') {
        throw error;
      }
    }
    // A new key: load the keys again, but not more often than the cooldown
    if (now() - loadedAt < cooldown) throw new UnknownKeyError();
    try {
      return await (await load())(header, token);
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_JWKS_NO_MATCHING_KEY') {
        throw new UnknownKeyError();
      }
      throw error;
    }
  };

  return { resolve };
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

function parseTrustedUrl(
  value: string,
  options: VercelOverridesOptions,
  name: string,
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OverridesError(
      `The ${name} of the Vercel overrides is not a URL.`,
    );
  }
  const isLocal =
    options.allowInsecureLocalhost === true &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocal) {
    throw new OverridesError(
      `The ${name} of the Vercel overrides must use HTTPS.`,
    );
  }
  if (url.username || url.password || url.hash) {
    throw new OverridesError(
      `The ${name} of the Vercel overrides must not contain credentials or a hash.`,
    );
  }
  return url;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new OverridesError(
      `The option ${name} of the Vercel overrides must be a positive number.`,
    );
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 20) return false;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.every((item) => isJson(item, depth + 1));
  }
  return (
    isPlainObject(value) &&
    Object.values(value).every((item) => isJson(item, depth + 1))
  );
}

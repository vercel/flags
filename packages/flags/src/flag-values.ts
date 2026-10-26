import { EncryptJWT, importJWK, type JWK, jwtDecrypt } from 'jose';
import { decodeSecret } from './overrides/shared-secret';
import type { JsonValue } from './overrides/types';
import {
  findPlatformProject,
  type PlatformProject,
  readLimited,
} from './overrides/vercel';

/**
 * The values of flags for the page: the key of each flag, and its value.
 */
export type FlagValuesType = Record<string, JsonValue>;

/**
 * Where the public keys of Vercel for the flag values are.
 *
 * @internal
 */
export const VERCEL_FLAG_VALUES_JWKS_URL =
  'https://keys.vercel-flags.com/.well-known/jwks.json';

/**
 * The rules for flag values which are encrypted with the public key of the
 * platform. They are part of the protocol, see the standard.
 *
 * @internal
 */
export const FLAG_VALUES_POLICY = Object.freeze({
  algorithm: 'ECDH-ES',
  encryption: 'A256GCM',
  audience: 'vercel:flag-values',
  purpose: 'flag-values',
  version: 1,
  cacheMaxAgeMs: 300_000,
  cooldownMs: 30_000,
  maxKeySetBytes: 65_536,
  maxKeys: 100,
  maxProjectIds: 100,
  maxProjectIdLength: 150,
});

export interface EncryptFlagValuesOptions {
  /**
   * - `platform`: encrypts with the public key of Vercel. Only Vercel can
   *   decrypt the values.
   * - `secret`: encrypts with `FLAGS_SECRET`, in the format of v4.
   *
   * The default is `secret` if `FLAGS_SECRET` is set, and `platform`
   * otherwise.
   */
  readonly method?: 'platform' | 'secret';
  /**
   * For `secret`. The default is the environment variable `FLAGS_SECRET`.
   */
  readonly secret?: string;
  /**
   * When the token expires. The default is one year for `secret`, as in v4,
   * and no expiry for `platform`.
   */
  readonly expirationTime?: string | number | Date;
  /**
   * For `platform`: where the public keys are. Must use HTTPS, except for
   * `localhost`. The default is the key set of Vercel.
   */
  readonly jwksUrl?: string;
  /**
   * For `platform`: the project whose ID is put in the protected header.
   * The default comes from the environment, as for the overrides.
   */
  readonly project?: Partial<PlatformProject>;
  /**
   * For `platform`: the project IDs which can use the token. The default is
   * the ID of `project` or the project from the environment.
   */
  readonly projectIds?: readonly string[];
  /**
   * For `platform`: the `fetch` function which loads the public keys. The
   * default is the global `fetch`.
   */
  readonly fetch?: typeof fetch;
}

/**
 * Encrypts flag values, so that a page can contain them without showing
 * them to its visitors. Give the result to `serializeFlagValues`.
 *
 * Without `FLAGS_SECRET`, it encrypts with the public key of Vercel, and
 * only Vercel can decrypt the values. With `FLAGS_SECRET`, it uses the
 * format of v4, which the Vercel Toolbar decrypts with the secret of the
 * project.
 *
 * Encryption with a public key gives no authenticity: each visitor can
 * encrypt other values. A receiver must not trust the values.
 *
 * @example
 * ```ts
 * const token = await encryptFlagValues({ 'summer-sale': true });
 * ```
 */
export async function encryptFlagValues(
  values: FlagValuesType,
  options: EncryptFlagValuesOptions = {},
): Promise<string> {
  const secret = options.secret ?? process.env.FLAGS_SECRET;
  const method = options.method ?? (secret ? 'secret' : 'platform');

  if (method === 'secret') {
    if (!secret) throw new Error('flags: Missing FLAGS_SECRET.');
    // The format of v4: the purpose `values`, and the values in `v`
    return new EncryptJWT({ v: values, pur: 'values' })
      .setExpirationTime(options.expirationTime ?? '1y')
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .encrypt(decodeSecret(secret));
  }

  const policy = FLAG_VALUES_POLICY;
  const projectIds = options.projectIds
    ? options.projectIds
    : projectIdsFromProject(options.project ?? findPlatformProject());
  if (options.projectIds === undefined && projectIds.length === 0) {
    throw new Error(
      'flags: Missing a project ID for the encrypted flag values.',
    );
  }
  validateProjectIds(projectIds);
  const { kid, key } = await loadPublicKey(
    options.jwksUrl ?? VERCEL_FLAG_VALUES_JWKS_URL,
    options.fetch,
  );
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
      projectIds,
    });
  if (options.expirationTime !== undefined) {
    jwt.setExpirationTime(options.expirationTime);
  }
  return jwt.encrypt(key);
}

/**
 * Decrypts flag values which `encryptFlagValues` encrypted with
 * `FLAGS_SECRET`. Returns `undefined` for a token which is not valid, e.g.
 * expired or encrypted with a different secret.
 *
 * Only the platform can decrypt values which are encrypted with its public
 * key.
 *
 * @param secret - The default is the environment variable `FLAGS_SECRET`.
 */
export async function decryptFlagValues(
  token: string,
  secret: string | undefined = process.env.FLAGS_SECRET,
): Promise<FlagValuesType | undefined> {
  if (!secret) throw new Error('flags: Missing FLAGS_SECRET.');
  const key = decodeSecret(secret);
  try {
    const { payload } = await jwtDecrypt(token, key);
    const purpose = payload.pur;
    const isValues = Array.isArray(purpose)
      ? purpose.includes('values')
      : purpose === 'values';
    if (!isValues || !isRecord(payload.v)) return undefined;
    return payload.v as FlagValuesType;
  } catch {
    return undefined;
  }
}

/**
 * Returns the content of the element of the flag values: JSON, in which
 * each `<` is escaped. Thus, the content can not end the element.
 *
 * ```html
 * <script type="application/json" data-flag-values>{content}</script>
 * ```
 *
 * @param data - The plain values, or a token of `encryptFlagValues`.
 */
export function serializeFlagValues(data: FlagValuesType | string): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

type PublicKey = { readonly kid: string; readonly key: CryptoKey };

type KeyCacheEntry = {
  value?: PublicKey;
  loadedAt: number;
  pending?: Promise<PublicKey>;
  error?: Error;
  failedAt: number;
};

const keyCache = new Map<string, KeyCacheEntry>();

/**
 * Loads the current public key, and keeps it for the process. Concurrent
 * loads share one request. After an error, it throws the same error until
 * the cooldown ends, so that a missing key set does not cause one request
 * for each page.
 */
function loadPublicKey(
  jwksUrl: string,
  customFetch: typeof fetch | undefined,
): Promise<PublicKey> {
  const policy = FLAG_VALUES_POLICY;
  const url = parseKeySetUrl(jwksUrl);
  const now = Date.now();
  let entry = keyCache.get(url.href);
  if (!entry) {
    entry = { loadedAt: Number.NEGATIVE_INFINITY, failedAt: 0 };
    keyCache.set(url.href, entry);
  }
  const current = entry;
  if (current.value && now - current.loadedAt < policy.cacheMaxAgeMs) {
    return Promise.resolve(current.value);
  }
  if (current.error && now - current.failedAt < policy.cooldownMs) {
    return Promise.reject(current.error);
  }
  current.pending ??= (async () => {
    try {
      // Read the global fetch at each load, because a framework can
      // replace it
      const response = await (customFetch ?? globalThis.fetch)(url, {
        redirect: 'error',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const jwk = selectKey(
        JSON.parse(await readLimited(response, policy.maxKeySetBytes)),
      );
      const key = await importJWK(jwk, policy.algorithm);
      if (key instanceof Uint8Array) throw new Error('the key is not public');
      current.value = { kid: jwk.kid as string, key };
      current.loadedAt = Date.now();
      current.error = undefined;
      return current.value;
    } catch (cause) {
      current.error = new Error(
        `flags: Could not load the public key for the flag values from ${url}: ${
          cause instanceof Error ? cause.message : String(cause)
        }.`,
        { cause },
      );
      current.failedAt = Date.now();
      throw current.error;
    }
  })().finally(() => {
    current.pending = undefined;
  });
  return current.pending;
}

/**
 * Returns the first key of the set which can encrypt the flag values. The
 * platform lists its current key first.
 */
function selectKey(data: unknown): JWK {
  const policy = FLAG_VALUES_POLICY;
  if (
    !isRecord(data) ||
    !Array.isArray(data.keys) ||
    data.keys.length > policy.maxKeys ||
    // A public key set must not contain private or secret keys
    !data.keys.every((key) => isRecord(key) && !('d' in key) && !('k' in key))
  ) {
    throw new Error('the key set is not valid');
  }
  const key = (data.keys as Record<string, unknown>[]).find(
    (key) =>
      key.kty === 'EC' &&
      key.crv === 'P-256' &&
      typeof key.kid === 'string' &&
      (key.use === undefined || key.use === 'enc') &&
      (key.alg === undefined || key.alg === policy.algorithm),
  );
  if (!key) throw new Error('the key set has no key for ECDH-ES with P-256');
  return key as JWK;
}

function parseKeySetUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('flags: The jwksUrl of the flag values is not a URL.');
  }
  const isLocal =
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocal) {
    throw new Error('flags: The jwksUrl of the flag values must use HTTPS.');
  }
  return url;
}

function projectIdsFromProject(project: Partial<PlatformProject>): string[] {
  return typeof project.projectId === 'string' && project.projectId
    ? [project.projectId]
    : [];
}

function validateProjectIds(projectIds: readonly string[]): void {
  const policy = FLAG_VALUES_POLICY;
  if (
    projectIds.length === 0 ||
    projectIds.length > policy.maxProjectIds ||
    projectIds.some(
      (id) =>
        typeof id !== 'string' ||
        id.length === 0 ||
        id.length > policy.maxProjectIdLength,
    ) ||
    new Set(projectIds).size !== projectIds.length
  ) {
    throw new Error(
      `flags: projectIds must contain 1 to ${policy.maxProjectIds} distinct, non-empty strings of at most ${policy.maxProjectIdLength} characters.`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Only for tests.
 *
 * @internal
 */
export function resetFlagValuesKeys(): void {
  keyCache.clear();
}

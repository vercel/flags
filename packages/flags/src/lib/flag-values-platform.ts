import { decodeJwt, EncryptJWT, importJWK, type JWK, type KeyLike } from 'jose';
import type { FlagValuesType } from '../types';

/**
 * Where the public keys of Vercel for the flag values are.
 *
 * @internal
 */
export const VERCEL_FLAG_VALUES_JWKS_URL =
  'https://keys.vercel-flags.com/.well-known/jwks.json';

/**
 * The rules for flag values which are encrypted with the public key of the
 * platform. They are part of the protocol.
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
  maxProjectIdLength: 150,
});

/**
 * Encrypts flag values with the public key of Vercel, for the project of the
 * host. Only Vercel can decrypt them.
 *
 * Encryption with a public key gives no authenticity: each visitor can
 * encrypt other values. A receiver must not trust the values.
 */
export async function encryptFlagValuesForPlatform(
  values: FlagValuesType,
  expirationTime?: string | number | Date,
): Promise<string> {
  const policy = FLAG_VALUES_POLICY;
  const projectId = findProjectId();
  if (!projectId) {
    throw new Error(
      'flags: Missing FLAGS_SECRET or a project ID for the encrypted flag values.',
    );
  }
  if (projectId.length > policy.maxProjectIdLength) {
    throw new Error(
      `flags: The project ID must have at most ${policy.maxProjectIdLength} characters.`,
    );
  }
  const { kid, key } = await loadPublicKey();
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
      projectIds: [projectId],
    });
  if (expirationTime !== undefined) jwt.setExpirationTime(expirationTime);
  return jwt.encrypt(key);
}

type PublicKey = { readonly kid: string; readonly key: KeyLike };

type KeyCacheEntry = {
  value?: PublicKey;
  loadedAt: number;
  pending?: Promise<PublicKey>;
  error?: Error;
  failedAt: number;
};

let keyCache: KeyCacheEntry = {
  loadedAt: Number.NEGATIVE_INFINITY,
  failedAt: 0,
};

/**
 * Loads the current public key, and keeps it for the process. Concurrent
 * loads share one request. After an error, it throws the same error until
 * the cooldown ends, so that a missing key set does not cause one request
 * for each page.
 */
function loadPublicKey(): Promise<PublicKey> {
  const policy = FLAG_VALUES_POLICY;
  const url = VERCEL_FLAG_VALUES_JWKS_URL;
  const now = Date.now();
  const current = keyCache;
  if (current.value && now - current.loadedAt < policy.cacheMaxAgeMs) {
    return Promise.resolve(current.value);
  }
  if (current.error && now - current.failedAt < policy.cooldownMs) {
    return Promise.reject(current.error);
  }
  if (current.pending) return current.pending;
  const pending = (async () => {
    try {
      // Read the global fetch at each load, because a framework can
      // replace it
      const response = await globalThis.fetch(url, {
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
  current.pending = pending;
  return pending;
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
  return key as unknown as JWK;
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
 * Finds the Vercel project of the host: the environment of a deployment, the
 * `VERCEL_OIDC_TOKEN` of `vercel env pull`, and the `.vercel/project.json` of
 * `vercel link`, in this order. An empty environment variable counts as
 * missing.
 */
function findProjectId(): string | undefined {
  return (
    process.env.VERCEL_PROJECT_ID ||
    readOidcProjectId() ||
    readLinkedProjectId()
  );
}

function readOidcProjectId(): string | undefined {
  const token = process.env.VERCEL_OIDC_TOKEN;
  if (!token) return undefined;
  try {
    const projectId = decodeJwt(token).project_id;
    return typeof projectId === 'string' && projectId ? projectId : undefined;
  } catch {
    return undefined;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Only for tests.
 *
 * @internal
 */
export function resetFlagValuesKeys(): void {
  keyCache = { loadedAt: Number.NEGATIVE_INFINITY, failedAt: 0 };
}

import { createHmac, randomBytes } from 'node:crypto';
import type { DatafileInput } from '@vercel/flags-core';
import { HttpError, isObject, readJson } from './http';

const DATAFILE_URL = 'https://flags.vercel.com/v1/datafile';
const CACHE_TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 64;
const MAX_DATAFILE_BYTES = 2 * 1024 * 1024;
const SOURCE_PROJECT_HEADER = 'X-Vercel-Flags-Project-Id';

type Credentials = {
  authorization: string;
  projectId: string | null;
  expiresAt: number;
  cacheKey: string;
};

function unauthorized(): HttpError {
  return new HttpError(
    401,
    'GENERAL',
    'Authentication is required or has expired.',
    {
      'WWW-Authenticate': 'Bearer',
    },
  );
}

function credentials(
  headers: Headers,
  now: number,
  cacheSecret: Buffer,
): Credentials {
  const authorization = headers.get('authorization');
  const apiKey = headers.get('x-api-key');
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if ((authorization && !match) || (!match && !apiKey)) throw unauthorized();
  const token = match?.[1] ?? apiKey!;
  if (/\s/.test(token) || (apiKey && match && apiKey !== token)) {
    throw unauthorized();
  }

  let expiresAt = Number.POSITIVE_INFINITY;
  // This is only a cache lifetime bound. The upstream service validates the JWT.
  if (token.split('.').length === 3) {
    try {
      const payload: unknown = JSON.parse(
        Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
      );
      if (isObject(payload) && typeof payload.exp === 'number') {
        expiresAt = payload.exp * 1000;
      }
    } catch {
      // Forward opaque credentials; never infer authorization from JWT claims.
    }
  }
  if (expiresAt <= now) throw unauthorized();
  const projectId = headers.get(SOURCE_PROJECT_HEADER);
  return {
    authorization: `Bearer ${token}`,
    projectId,
    expiresAt,
    cacheKey: createHmac('sha256', cacheSecret)
      .update(JSON.stringify([token, projectId]))
      .digest('hex'),
  };
}

type Entry = { data: DatafileInput; expiresAt: number };

export function createDatafileLoader({
  fetch: fetchData = globalThis.fetch,
  now = Date.now,
}: {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
} = {}) {
  // These are transient cache identifiers, not stored password verifiers.
  // A private key prevents credential guesses from being checked against an
  // isolated cache identifier. Its lifetime is limited to this cache instance.
  const cacheSecret = randomBytes(32);
  const cache = new Map<string, Entry>();
  const pending = new Map<string, Promise<DatafileInput>>();

  async function load(auth: Credentials): Promise<DatafileInput> {
    const response = await fetchData(DATAFILE_URL, {
      headers: {
        Authorization: auth.authorization,
        ...(auth.projectId ? { [SOURCE_PROJECT_HEADER]: auth.projectId } : {}),
        Accept: 'application/json',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      if (response.status === 401) throw unauthorized();
      if (response.status === 403) {
        throw new HttpError(
          403,
          'GENERAL',
          'Access to these flags is forbidden.',
        );
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        throw new HttpError(
          429,
          'GENERAL',
          'Too many requests.',
          retryAfter ? { 'Retry-After': retryAfter } : undefined,
        );
      }
      throw new Error('Data service request failed');
    }
    const data = await readJson(response.body, MAX_DATAFILE_BYTES);
    if (
      !isObject(data) ||
      !isObject(data.definitions) ||
      typeof data.environment !== 'string' ||
      !data.environment ||
      typeof data.projectId !== 'string' ||
      !data.projectId ||
      (data.segments !== undefined && !isObject(data.segments))
    ) {
      throw new Error('Invalid datafile');
    }
    if (auth.expiresAt <= now()) throw unauthorized();
    const datafile = data as DatafileInput;
    if (cache.size >= MAX_CACHE_ENTRIES) {
      cache.delete(cache.keys().next().value!);
    }
    cache.set(auth.cacheKey, {
      data: datafile,
      expiresAt: Math.min(now() + CACHE_TTL_MS, auth.expiresAt),
    });
    return datafile;
  }

  return async (request: Request): Promise<DatafileInput> => {
    const auth = credentials(request.headers, now(), cacheSecret);
    // Change-event metadata requires a fresh read, independent of the HTTP ETag.
    const query = new URL(request.url).searchParams;
    const forceRefresh =
      query.has('flagConfigEtag') || query.has('flagConfigLastModified');
    const cached = cache.get(auth.cacheKey);
    if (!forceRefresh && cached && cached.expiresAt > now()) {
      cache.delete(auth.cacheKey);
      cache.set(auth.cacheKey, cached);
      return cached.data;
    }
    cache.delete(auth.cacheKey);
    let operation = pending.get(auth.cacheKey);
    if (!operation) {
      if (pending.size >= MAX_CACHE_ENTRIES) {
        throw new HttpError(429, 'GENERAL', 'Too many requests.', {
          'Retry-After': '1',
        });
      }
      operation = load(auth).finally(() => pending.delete(auth.cacheKey));
      pending.set(auth.cacheKey, operation);
    }
    const data = await operation;
    if (auth.expiresAt <= now()) throw unauthorized();
    return data;
  };
}

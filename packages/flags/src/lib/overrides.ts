import { decryptOverridesWithExpiry } from './crypto';
import {
  isFlagOverridesFromPlatform,
  verifyFlagOverridesFromPlatform,
} from './flag-overrides-platform';
import { readFlagsSecret } from './vercel-platform';

/**
 * The last decrypted override token. Many flags of one request read the same
 * cookie, so it is decrypted one time. The entry keeps the expiry of the
 * token, which is checked on each use: an expired token must not override a
 * flag, also when it is still in the cache. The secret is part of the key,
 * so that a rotated secret does not accept an old token.
 */
let cache:
  | {
      readonly cookie: string;
      readonly secret: string;
      readonly result: ReturnType<typeof decryptOverridesWithExpiry>;
    }
  | undefined;

async function decryptCached(cookie: string, secret: string) {
  if (!cache || cache.cookie !== cookie || cache.secret !== secret) {
    cache = {
      cookie,
      secret,
      result: decryptOverridesWithExpiry(cookie, secret),
    };
  }
  const entry = cache;
  const decrypted = await entry.result;
  if (!decrypted) {
    return undefined;
  }
  if (Date.now() >= decrypted.expiresAt) {
    if (cache === entry) {
      cache = undefined;
    }
    return undefined;
  }
  return decrypted.overrides;
}

/**
 * The cookies which can contain an override token, in the order in which the
 * SDK reads them. `flag-overrides` is the cookie of the standard, and
 * `vercel-flag-overrides` the cookie of v4 of the SDK.
 */
export const OVERRIDES_COOKIES = [
  'flag-overrides',
  'vercel-flag-overrides',
] as const;

/**
 * The override token of a request: the first cookie of `OVERRIDES_COOKIES`
 * which is not empty. If both cookies are set, `flag-overrides` wins. A
 * cookie contains one token, so the overrides of both are never merged.
 */
export function findOverridesToken(cookies: {
  get(name: string): { value: string } | undefined;
}): string | undefined {
  for (const name of OVERRIDES_COOKIES) {
    const value = cookies.get(name)?.value;
    if (value) {
      return value;
    }
  }
  return undefined;
}

export async function getOverrides(cookie: string | undefined) {
  if (typeof cookie !== 'string' || cookie === '') {
    return null;
  }
  if (isFlagOverridesFromPlatform(cookie)) {
    // Not memoized, so a signed token stops working when it expires
    return (await verifyFlagOverridesFromPlatform(cookie)) ?? null;
  }
  // Without a secret, the host can not read the cookie, e.g. an encrypted
  // cookie which is still in the browser after the secret was removed
  const secret = readFlagsSecret();
  if (!secret) {
    return null;
  }
  return (await decryptCached(cookie, secret)) ?? null;
}

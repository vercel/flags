import { decryptOverridesWithExpiry } from '../lib/crypto';
import {
  isFlagOverridesFromPlatform,
  verifyFlagOverridesFromPlatform,
} from '../lib/flag-overrides-platform';

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
  const secret = process.env.FLAGS_SECRET;
  if (!secret) {
    return null;
  }
  return (await decryptCached(cookie, secret)) ?? null;
}

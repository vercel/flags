import { memoizeOne } from '../lib/async-memoize-one';
import { decryptOverrides } from '../lib/crypto';
import type { ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';

const memoizedDecrypt = memoizeOne(
  (text: string, secret?: string) => decryptOverrides(text, secret),
  // Re-decrypt when either the cookie text or the secret changes.
  (a, b) => a[0] === b[0] && a[1] === b[1],
  { cachePromiseRejection: true },
);

/**
 * Decrypts the `vercel-flag-overrides` cookie value. Returns `null` when the
 * cookie is absent or empty (skipping the decrypt microtask).
 *
 * @param cookie - The raw cookie value
 * @param secret - The decryption secret (defaults to `FLAGS_SECRET` env var)
 */
export async function getOverrides(
  cookie: string | undefined,
  secret?: string,
): Promise<Record<string, any> | null> {
  if (typeof cookie === 'string' && cookie !== '') {
    const cookieOverrides = await memoizedDecrypt(cookie, secret);
    return cookieOverrides ?? null;
  }

  return null;
}

/**
 * Reads and decrypts the `vercel-flag-overrides` cookie off a sealed cookie
 * store. Returns `null` when the cookie is absent or empty.
 *
 * @param cookies - The sealed request cookies
 * @param secret - The decryption secret (defaults to `FLAGS_SECRET` env var)
 */
export function readOverrides(
  cookies: ReadonlyRequestCookies,
  secret?: string,
): Promise<Record<string, any> | null> {
  return getOverrides(cookies.get('vercel-flag-overrides')?.value, secret);
}

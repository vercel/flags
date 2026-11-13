import { decryptOverrides } from '..';
import { memoizeOne } from '../lib/async-memoize-one';
import {
  isFlagOverridesFromPlatform,
  verifyFlagOverridesFromPlatform,
} from '../lib/flag-overrides-platform';

const memoizedDecrypt = memoizeOne(
  (text: string) => decryptOverrides(text),
  (a, b) => a[0] === b[0], // only the first argument gets compared
  { cachePromiseRejection: true },
);

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
  if (!process.env.FLAGS_SECRET) {
    return null;
  }
  return (await memoizedDecrypt(cookie)) ?? null;
}

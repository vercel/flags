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
  if (typeof cookie === 'string' && cookie !== '') {
    // Not memoized, so a signed token stops working when it expires
    const cookieOverrides = isFlagOverridesFromPlatform(cookie)
      ? await verifyFlagOverridesFromPlatform(cookie)
      : await memoizedDecrypt(cookie);
    return cookieOverrides ?? null;
  }

  return null;
}

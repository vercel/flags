import { decryptOverrides } from '..';
import { memoizeOne } from '../lib/async-memoize-one';
import {
  isVercelSignedToken,
  verifyVercelSignedOverrides,
} from '../lib/vercel-overrides';

const memoizedDecrypt = memoizeOne(
  (text: string) => decryptOverrides(text),
  (a, b) => a[0] === b[0], // only the first argument gets compared
  { cachePromiseRejection: true },
);

export async function getOverrides(cookie: string | undefined) {
  if (typeof cookie === 'string' && cookie !== '') {
    // Not memoized, so a signed token stops working when it expires
    const cookieOverrides = isVercelSignedToken(cookie)
      ? await verifyVercelSignedOverrides(cookie)
      : await memoizedDecrypt(cookie);
    return cookieOverrides ?? null;
  }

  return null;
}

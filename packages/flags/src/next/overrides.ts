import { type FlagOverridesType, decrypt } from '..';
import { memoizeOne } from '../lib/async-memoize-one';

const memoizedDecrypt = memoizeOne(
  (text: string) => decrypt<FlagOverridesType>(text),
  (a, b) => a[0] === b[0], // only the first argument gets compared
  { cachePromiseRejection: true },
);

export async function getOverrides(cookie: string | undefined) {
  if (typeof cookie === 'string' && cookie !== '') {
    const cookieOverrides = await memoizedDecrypt(cookie);
    return cookieOverrides ?? null;
  }

  return null;
}

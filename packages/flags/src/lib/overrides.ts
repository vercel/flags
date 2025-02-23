import { type FlagOverridesType, decrypt } from '..';
import { memoizeOne } from './async-memoize-one';

const memoizedDecrypt = memoizeOne(
  (text: string, secret?: string) => decrypt<FlagOverridesType>(text, secret),
  (a, b) => a[0] === b[0] && a[1] === b[1],
  { cachePromiseRejection: true },
);

export async function getOverrides(
  cookie: string | undefined,
  secret?: string,
) {
  if (typeof cookie === 'string' && cookie !== '') {
    const cookieOverrides = await memoizedDecrypt(cookie, secret);
    return cookieOverrides ?? null;
  }

  return null;
}

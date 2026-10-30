import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import type { Connection } from './connection.ts';
import { createScope } from './scope.ts';

// React owns the lifetime of this cache: one Server Component render request.
export const getScope = cache(async () => {
  const [requestHeaders, requestCookies] = await Promise.all([
    headers(),
    cookies(),
  ]);
  return createScope({
    headers: { get: (name) => requestHeaders.get(name) },
    cookies: {
      get(name) {
        const cookie = requestCookies.get(name);
        if (!cookie) {
          return undefined;
        }
        return { value: cookie.value };
      },
    },
  });
});

export function createFlag<Context, const Variants extends readonly unknown[]>(
  connection: Connection<Context>,
  key: string,
  variants: Variants,
  catalogId: string,
) {
  return async (): Promise<Variants[number]> => {
    const scope = await getScope();
    return scope.evaluate(connection, key, variants, catalogId);
  };
}

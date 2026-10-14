import { dedupe } from 'flags/next';
import { USER_ID_COOKIE, USER_ID_HEADER } from './constants';

export interface Entities {
  user?: { id: string };
}

// `baseUrl: "."` in tsconfig makes a bare `flags` import resolve to the local
// `flags.ts`, so the cookie and header shapes are typed structurally instead
// of importing `ReadonlyRequestCookies` and `ReadonlyHeaders` from `flags`.
type CookieReader = { get(name: string): { value: string } | undefined };
type HeaderReader = Pick<Headers, 'get'>;

const generateUserId = dedupe(async () => crypto.randomUUID());

export async function getOrGenerateUserId(
  cookies: CookieReader,
  headers: HeaderReader,
): Promise<string> {
  const cookieUserId = cookies.get(USER_ID_COOKIE)?.value;
  if (cookieUserId) {
    return cookieUserId;
  }

  const headerUserId = headers.get(USER_ID_HEADER);
  if (headerUserId) {
    return headerUserId;
  }

  return generateUserId();
}

export const identify = dedupe(
  async ({
    cookies,
    headers,
  }: {
    cookies: CookieReader;
    headers: HeaderReader;
  }): Promise<Entities> => {
    return { user: { id: await getOrGenerateUserId(cookies, headers) } };
  },
);

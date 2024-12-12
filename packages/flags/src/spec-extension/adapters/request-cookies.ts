// copied from Next.js, and reduced
// https://github.com/vercel/next.js/tree/canary/packages/next/src/server/web/spec-extension
import { RequestCookies } from '../cookies';
import { ResponseCookies } from '../cookies';
import { ReflectAdapter } from './reflect';

/**
 * @internal
 */
export class ReadonlyRequestCookiesError extends Error {
  constructor() {
    super(
      'Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs/app/api-reference/functions/cookies#options',
    );
  }

  public static callable() {
    throw new ReadonlyRequestCookiesError();
  }
}

// We use this to type some APIs but we don't construct instances directly
export type { ResponseCookies };

// The `cookies()` API is a mix of request and response cookies. For `.get()` methods,
// we want to return the request cookie if it exists. For mutative methods like `.set()`,
// we want to return the response cookie.
export type ReadonlyRequestCookies = Omit<
  RequestCookies,
  'set' | 'clear' | 'delete'
> &
  Pick<ResponseCookies, 'set' | 'delete'>;

export class RequestCookiesAdapter {
  public static seal(cookies: RequestCookies): ReadonlyRequestCookies {
    return new Proxy(cookies as any, {
      get(target, prop, receiver) {
        switch (prop) {
          case 'clear':
          case 'delete':
          case 'set':
            return ReadonlyRequestCookiesError.callable;
          default:
            return ReflectAdapter.get(target, prop, receiver);
        }
      },
    });
  }
}

const SYMBOL_MODIFY_COOKIE_VALUES = Symbol.for('next.mutated.cookies');

export function getModifiedCookieValues(
  cookies: ResponseCookies,
): ResponseCookie[] {
  const modified: ResponseCookie[] | undefined = (cookies as unknown as any)[
    SYMBOL_MODIFY_COOKIE_VALUES
  ];
  if (!modified || !Array.isArray(modified) || modified.length === 0) {
    return [];
  }

  return modified;
}

type SetCookieArgs =
  | [key: string, value: string, cookie?: Partial<ResponseCookie>]
  | [options: ResponseCookie];

export function appendMutableCookies(
  headers: Headers,
  mutableCookies: ResponseCookies,
): boolean {
  const modifiedCookieValues = getModifiedCookieValues(mutableCookies);
  if (modifiedCookieValues.length === 0) {
    return false;
  }

  // Return a new response that extends the response with
  // the modified cookies as fallbacks. `res` cookies
  // will still take precedence.
  const resCookies = new ResponseCookies(headers);
  const returnedCookies = resCookies.getAll();

  // Set the modified cookies as fallbacks.
  for (const cookie of modifiedCookieValues) {
    resCookies.set(cookie);
  }

  // Set the original cookies as the final values.
  for (const cookie of returnedCookies) {
    resCookies.set(cookie);
  }

  return true;
}

type ResponseCookie = NonNullable<
  ReturnType<InstanceType<typeof ResponseCookies>['get']>
>;

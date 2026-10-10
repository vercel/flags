import type {
  FlagsRequest,
  ReadonlyRequestCookies,
  RequestCookie,
} from './types';

const parsed = new WeakMap<FlagsRequest['headers'], ReadonlyRequestCookies>();

/**
 * Returns the cookies of a request. Uses `request.cookies` if the framework
 * gives them. Otherwise reads the `Cookie` header.
 */
export function getCookies(request: FlagsRequest): ReadonlyRequestCookies {
  if (request.cookies) return request.cookies;

  let cookies = parsed.get(request.headers);
  if (!cookies) {
    cookies = parseCookies(request.headers.get('cookie') ?? '');
    parsed.set(request.headers, cookies);
  }
  return cookies;
}

function parseCookies(header: string): ReadonlyRequestCookies {
  const all: RequestCookie[] = [];
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    let value = part.slice(index + 1).trim();
    if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    all.push({ name, value: decode(value) });
  }

  return {
    // The first cookie wins, because browsers send the most specific first
    get: (name) => all.find((cookie) => cookie.name === name),
    getAll: () => [...all],
    has: (name) => all.some((cookie) => cookie.name === name),
  };
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

import type {
  FlagsRequest,
  FlagsRequestInit,
  ReadonlyRequestCookies,
  RequestCookie,
} from './types';

/**
 * Creates the standard request from what a framework gives. Reads each
 * property only when a step uses it.
 *
 * @internal
 */
export function createFlagsRequest(init: FlagsRequestInit): FlagsRequest {
  let headers: FlagsRequest['headers'];
  let cookies: FlagsRequest['cookies'];
  let url: FlagsRequest['url'];
  let hasHeaders = false;
  let hasCookies = false;
  let hasUrl = false;

  const request: FlagsRequest = {
    get headers() {
      if (!hasHeaders) {
        headers = init.headers;
        hasHeaders = true;
      }
      return headers;
    },
    get cookies() {
      if (!hasCookies) {
        cookies = init.cookies ?? cookiesFromHeaders(request.headers);
        hasCookies = true;
      }
      return cookies;
    },
    get url() {
      if (!hasUrl) {
        url = init.url === undefined ? undefined : toURL(init.url);
        hasUrl = true;
      }
      return url;
    },
  };
  return Object.freeze(request);
}

function toURL(value: string | URL): URL {
  try {
    return new URL(value);
  } catch (cause) {
    throw new TypeError(
      `flags: The URL of the request must be a full URL, but it is "${String(value)}".`,
      { cause },
    );
  }
}

function cookiesFromHeaders(
  headers: FlagsRequest['headers'],
): ReadonlyRequestCookies | undefined {
  if (!headers) return undefined;
  return parseCookies(headers.get('cookie') ?? '');
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
    all.push(Object.freeze({ name, value: decode(value) }));
  }

  return Object.freeze({
    // The first cookie wins, because browsers send the most specific first
    get: (name: string) => all.find((cookie) => cookie.name === name),
    getAll: () => [...all],
    has: (name: string) => all.some((cookie) => cookie.name === name),
  });
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

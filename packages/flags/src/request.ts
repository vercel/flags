import type { IncomingHttpHeaders } from 'node:http';
import { RequestCookies } from '@edge-runtime/cookies';
import {
  HeadersAdapter,
  type ReadonlyHeaders,
} from './spec-extension/adapters/headers';
import {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from './spec-extension/adapters/request-cookies';

/**
 * What a framework gives about a request. Each property is optional, and a
 * Web `Request` fits. The headers can also be the headers of a Node.js
 * `IncomingMessage`, e.g. of the Pages Router of Next.js.
 *
 * The SDK identifies a request by its `headers` object, so the framework
 * must give the same `headers` object during one request.
 */
export interface FlagsRequestInit {
  readonly headers?: ReadonlyHeaders | Headers | IncomingHttpHeaders;
  readonly cookies?: ReadonlyRequestCookies;
  readonly url?: string | URL;
}

/**
 * The request which each step of an evaluation receives: the same shape for
 * each framework. The properties can be read, but not modified.
 */
export interface FlagsRequest {
  readonly headers: ReadonlyHeaders;
  /**
   * The cookies of the framework, or else the cookies of the `Cookie`
   * header.
   */
  readonly cookies: ReadonlyRequestCookies;
  /**
   * The URL of the request, if the framework gives it. Reading it throws a
   * `TypeError` if the framework gives a URL which is not a full URL.
   */
  readonly url: Readonly<URL> | undefined;
}

/**
 * Turns the headers of an `IncomingMessage` into `Headers`.
 */
function toHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }
    } else if (value !== undefined) {
      result.append(key, value);
    }
  }
  return result;
}

function isHeaders(
  headers: NonNullable<FlagsRequestInit['headers']>,
): headers is Headers | ReadonlyHeaders {
  return typeof (headers as { get?: unknown }).get === 'function';
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

/**
 * Creates the standard request from what a framework gives.
 *
 * - Headers which the framework gives as `Headers` stay as they are when
 *   the framework also gives the cookies, e.g. `headers()` and `cookies()`
 *   of Next.js. Otherwise they are sealed, so that a step can not modify
 *   them.
 * - Without cookies, the cookies come from the `Cookie` header.
 * - The URL is read when a step uses it.
 *
 * @internal
 */
export function createFlagsRequest(init: FlagsRequestInit): FlagsRequest {
  let headers: ReadonlyHeaders;
  let cookies: ReadonlyRequestCookies;
  const given = init.headers;
  if (given && isHeaders(given) && init.cookies) {
    headers = given as ReadonlyHeaders;
    cookies = init.cookies;
  } else {
    let raw: Headers;
    if (!given) {
      raw = new Headers();
    } else if (isHeaders(given)) {
      raw = given as Headers;
    } else {
      raw = toHeaders(given);
    }
    headers = HeadersAdapter.seal(raw);
    cookies =
      init.cookies ?? RequestCookiesAdapter.seal(new RequestCookies(raw));
  }

  let url: URL | undefined;
  let hasUrl = false;
  return Object.freeze({
    headers,
    cookies,
    get url() {
      if (!hasUrl) {
        url = init.url === undefined ? undefined : toURL(init.url);
        hasUrl = true;
      }
      return url;
    },
  });
}

import type { IncomingHttpHeaders } from 'node:http';
import { RequestCookies } from '@edge-runtime/cookies';
import {
  HeadersAdapter,
  type ReadonlyHeaders,
} from '../spec-extension/adapters/headers';
import {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from '../spec-extension/adapters/request-cookies';

const transformMap = new WeakMap<IncomingHttpHeaders, Headers>();
const headersMap = new WeakMap<Headers, ReadonlyHeaders>();
const cookiesMap = new WeakMap<Headers, ReadonlyRequestCookies>();

/**
 * Transforms `IncomingHttpHeaders` (Pages Router `IncomingMessage`) to a
 * standard `Headers` instance. Cached by the original object identity so the
 * resulting `Headers` is stable across calls within a request.
 */
export function transformToHeaders(
  incomingHeaders: IncomingHttpHeaders,
): Headers {
  const cached = transformMap.get(incomingHeaders);
  if (cached !== undefined) return cached;

  const headers = new Headers();
  for (const [key, value] of Object.entries(incomingHeaders)) {
    if (Array.isArray(value)) {
      // If the value is an array, add each item separately
      value.forEach((item) => {
        headers.append(key, item);
      });
    } else if (value !== undefined) {
      // If it's a single value, add it directly
      headers.append(key, value);
    }
  }

  transformMap.set(incomingHeaders, headers);
  return headers;
}

/**
 * Wraps a `Headers` instance in a read-only adapter, cached by the original
 * `Headers` identity.
 */
export function sealHeaders(headers: Headers): ReadonlyHeaders {
  const cached = headersMap.get(headers);
  if (cached !== undefined) return cached;

  const sealed = HeadersAdapter.seal(headers);
  headersMap.set(headers, sealed);
  return sealed;
}

/**
 * Reads the cookies off a `Headers` instance and wraps them in a read-only
 * adapter, cached by the original `Headers` identity.
 */
export function sealCookies(headers: Headers): ReadonlyRequestCookies {
  const cached = cookiesMap.get(headers);
  if (cached !== undefined) return cached;

  const sealed = RequestCookiesAdapter.seal(new RequestCookies(headers));
  cookiesMap.set(headers, sealed);
  return sealed;
}

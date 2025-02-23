import type { IncomingHttpHeaders } from 'node:http';
import { RequestCookies } from '@edge-runtime/cookies';
import {
  type ReadonlyHeaders,
  HeadersAdapter,
} from '../spec-extension/adapters/headers';
import {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from '../spec-extension/adapters/request-cookies';

const transformMap = new WeakMap<IncomingHttpHeaders, Headers>();
const headersMap = new WeakMap<Headers, ReadonlyHeaders>();
const cookiesMap = new WeakMap<Headers, ReadonlyRequestCookies>();

/**
 * Transforms IncomingHttpHeaders to Headers
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
      value.forEach((item) => headers.append(key, item));
    } else if (value !== undefined) {
      // If it's a single value, add it directly
      headers.append(key, value);
    }
  }

  transformMap.set(incomingHeaders, headers);
  return headers;
}

export function sealHeaders(headers: Headers): ReadonlyHeaders {
  const cached = headersMap.get(headers);
  if (cached !== undefined) return cached;

  const sealed = HeadersAdapter.seal(headers);
  headersMap.set(headers, sealed);
  return sealed;
}

export function sealCookies(headers: Headers): ReadonlyRequestCookies {
  const cached = cookiesMap.get(headers);
  if (cached !== undefined) return cached;

  const sealed = RequestCookiesAdapter.seal(new RequestCookies(headers));
  cookiesMap.set(headers, sealed);
  return sealed;
}

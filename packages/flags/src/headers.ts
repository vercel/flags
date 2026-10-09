import type { NodeHeaders, ReadonlyHeaders } from './types';

/**
 * Converts the headers of any framework to Web `Headers`.
 *
 * @internal
 */
export function toHeaders(
  headers: ReadonlyHeaders | NodeHeaders,
): ReadonlyHeaders {
  if (typeof headers.get === 'function') return headers as ReadonlyHeaders;

  const result = new Headers();
  for (const [name, value] of Object.entries(headers as NodeHeaders)) {
    // HTTP/2 pseudo-headers, e.g. ":path", are not valid header names
    if (value === undefined || name.startsWith(':')) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      result.append(name, item);
    }
  }
  return result;
}

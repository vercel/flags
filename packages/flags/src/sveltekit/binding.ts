import { AsyncLocalStorage } from 'node:async_hooks';
import { RequestCookies } from '@edge-runtime/cookies';
import { type FrameworkBinding, getFramework } from '../lib/framework';
import {
  HeadersAdapter,
  type ReadonlyHeaders,
} from '../spec-extension/adapters/headers';
import {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from '../spec-extension/adapters/request-cookies';
import type { Identify, JsonValue } from '../types';
import { isSvelteKitControlFlow } from './is-sveltekit-control-flow';

/**
 * The state of one request: the request, and the flags and identifiers
 * which it used.
 *
 * @internal
 */
export interface FlagsRequestContext {
  request: Request;
  secret: string | undefined;
  params: Record<string, string>;
  usedFlags: Record<string, Promise<JsonValue>>;
  identifiers: Map<Identify<unknown>, ReturnType<Identify<unknown>>>;
}

/**
 * The scope of the current request. `createHandle` sets it for each request
 * of SvelteKit.
 *
 * @internal
 */
export const flagStorage = new AsyncLocalStorage<FlagsRequestContext>();

const headersMap = new WeakMap<Headers, ReadonlyHeaders>();
const cookiesMap = new WeakMap<Headers, ReadonlyRequestCookies>();

/**
 * The headers of a request, sealed one time for each request.
 *
 * @internal
 */
export function sealHeaders(headers: Headers): ReadonlyHeaders {
  const cached = headersMap.get(headers);
  if (cached !== undefined) return cached;

  const sealed = HeadersAdapter.seal(headers);
  headersMap.set(headers, sealed);
  return sealed;
}

/**
 * The cookies of a request, sealed one time for each request.
 *
 * @internal
 */
export function sealCookies(headers: Headers): ReadonlyRequestCookies {
  const cached = cookiesMap.get(headers);
  if (cached !== undefined) return cached;

  const sealed = RequestCookiesAdapter.seal(new RequestCookies(headers));
  cookiesMap.set(headers, sealed);
  return sealed;
}

function currentRequest(): Request {
  const store = flagStorage.getStore();
  if (!store) {
    throw new Error('flags: Neither context found nor Request provided');
  }
  return store.request;
}

/**
 * The binding of SvelteKit: the request of the scope which `createHandle`
 * sets for each request.
 *
 * @internal
 */
export const svelteKitBinding: FrameworkBinding = {
  name: 'sveltekit',
  async getHeaders() {
    return sealHeaders(currentRequest().headers);
  },
  async getRequest() {
    const { headers } = currentRequest();
    return { headers: sealHeaders(headers), cookies: sealCookies(headers) };
  },
  isFrameworkSignal: isSvelteKitControlFlow,
};

/**
 * The binding which `flags/sveltekit` uses: the supplied one, or else the
 * binding of SvelteKit.
 *
 * @internal
 */
export function framework(): FrameworkBinding {
  return getFramework(svelteKitBinding);
}

/**
 * Whether an error is a signal of SvelteKit, e.g. `redirect()`, which the
 * SDK must throw again.
 *
 * @internal
 */
export function isFrameworkSignal(error: unknown): boolean {
  return framework().isFrameworkSignal(error);
}

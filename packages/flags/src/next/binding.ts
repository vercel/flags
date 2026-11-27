import { type FrameworkBinding, getFramework } from '../lib/framework';
import type { ReadonlyHeaders } from '../spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';
import { isInternalNextError } from './is-internal-next-error';

// An async import, because Turbopack fails in the Pages Router when
// next/headers is imported at the top level. The module is kept, so that
// each later call needs no extra await.
let headersModulePromise: Promise<typeof import('next/headers')> | undefined;
let headersModule: typeof import('next/headers') | undefined;

/**
 * `unstable_rethrow` of `next/navigation`, which Next.js has since 15.0.0. It
 * is loaded with `next/headers`, so only in the App Router, and is not known
 * before then.
 */
let rethrowOfNext: ((error: unknown) => void) | undefined;

async function loadHeadersModule(): Promise<typeof import('next/headers')> {
  if (!headersModulePromise) {
    // Both together, so unstable_rethrow is known before the first request
    // is read
    headersModulePromise = Promise.all([
      import('next/headers'),
      import('next/navigation'),
    ]).then(([headersOfNext, navigation]) => {
      rethrowOfNext = navigation.unstable_rethrow;
      return headersOfNext;
    });
  }
  if (!headersModule) {
    headersModule = await headersModulePromise;
  }
  return headersModule;
}

/**
 * The error for a flag in a cache scope, e.g. `'use cache'`. A flag value
 * depends on the request, so it must not be cached.
 *
 * @internal
 */
export class FlagInCacheError extends Error {
  constructor(cause: unknown) {
    super(
      'flags: A flag can not be evaluated inside a cache scope, e.g. "use cache", because a flag value must not be cached. Evaluate the flag outside of the cached function, and pass the value in as an argument.',
      { cause },
    );
    this.name = 'FlagInCacheError';
  }
}

/**
 * Whether Next.js rejected `headers()` or `cookies()` because of a cache
 * scope. Next.js has no public API for it, so the message is the signal. The
 * wording changes between versions, e.g. `inside "use cache"` before 16.4.6,
 * and ``inside `"use cache"` `` since, so the check only looks for the name
 * of the scope.
 *
 * @internal
 */
export function isCacheScopeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  // "use cache", "use cache: private", "use cache: remote"
  return (
    error.message.includes('"use cache') ||
    error.message.includes('unstable_cache()')
  );
}

/**
 * Calls a function of `next/headers`, and replaces the error of a cache
 * scope with a clear error. Other errors stay as they are.
 */
async function readRequest<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (isCacheScopeError(error)) {
      throw new FlagInCacheError(error);
    }
    throw error;
  }
}

/**
 * Whether an error is an internal error of Next.js, e.g. of `redirect()` or
 * `notFound()`. It is `isInternalNextError`, and also `unstable_rethrow` once
 * `next/navigation` is loaded, so an error is never caught which Next.js must
 * receive.
 *
 * @internal
 */
export function isNextSignal(error: unknown): boolean {
  if (isInternalNextError(error)) {
    return true;
  }
  if (!rethrowOfNext) {
    return false;
  }
  try {
    rethrowOfNext(error);
    return false;
  } catch {
    return true;
  }
}

/**
 * The binding of Next.js: the request of `headers()` and `cookies()` of
 * `next/headers`, in the App Router. A call outside of a request throws the
 * error of Next.js.
 *
 * @internal
 */
export const nextBinding: FrameworkBinding = {
  name: 'next',
  async getHeaders() {
    const { headers } = await loadHeadersModule();
    return readRequest(async () => (await headers()) as ReadonlyHeaders);
  },
  async getRequest() {
    const { headers, cookies } = await loadHeadersModule();
    const [headersStore, cookiesStore] = await readRequest(() =>
      Promise.all([headers(), cookies()]),
    );
    return {
      headers: headersStore as ReadonlyHeaders,
      cookies: cookiesStore as ReadonlyRequestCookies,
    };
  },
  isFrameworkSignal: isNextSignal,
};

/**
 * The binding which `flags/next` uses: the supplied one, or else the binding
 * of Next.js.
 *
 * @internal
 */
export function framework(): FrameworkBinding {
  return getFramework(nextBinding);
}

/**
 * Whether an error is a signal of the framework, e.g. `notFound()`, which
 * the SDK must throw again.
 *
 * @internal
 */
export function isFrameworkSignal(error: unknown): boolean {
  return framework().isFrameworkSignal(error);
}

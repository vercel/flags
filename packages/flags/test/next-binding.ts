/**
 * The framework binding of the tests of `flags`: `headers()` and `cookies()`
 * of `next/headers`, which the tests mock. The vitest config points the
 * alias `flags/framework` to this module, as `withFlags` of
 * `@flags-sdk/next/plugin` does with `@flags-sdk/next/binding`.
 */
import type { FrameworkBinding } from '../src/lib/framework';
import type { ReadonlyHeaders } from '../src/spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from '../src/spec-extension/adapters/request-cookies';

const REACT_POSTPONE_TYPE: symbol = Symbol.for('react.postpone');

/** The internal errors of Next.js, as `@flags-sdk/next` recognizes them */
function isInternalNextError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    '$$typeof' in error &&
    error.$$typeof === REACT_POSTPONE_TYPE
  ) {
    return true;
  }
  if (
    typeof error !== 'object' ||
    error === null ||
    !('digest' in error) ||
    typeof error.digest !== 'string'
  ) {
    return false;
  }
  const errorCode = error.digest.split(';')[0];
  return (
    errorCode === 'NEXT_REDIRECT' ||
    errorCode === 'DYNAMIC_SERVER_USAGE' ||
    errorCode === 'BAILOUT_TO_CLIENT_SIDE_RENDERING' ||
    errorCode === 'NEXT_NOT_FOUND' ||
    errorCode === 'HANGING_PROMISE_REJECTION'
  );
}

// One import, as in @flags-sdk/next/binding
let headersModule: Promise<typeof import('next/headers')> | undefined;
function loadHeadersModule(): Promise<typeof import('next/headers')> {
  headersModule ??= import('next/headers');
  return headersModule;
}

export const binding: FrameworkBinding = {
  name: 'next',
  async getHeaders() {
    const { headers } = await loadHeadersModule();
    return (await headers()) as ReadonlyHeaders;
  },
  async getRequest() {
    const { headers, cookies } = await loadHeadersModule();
    const [headersStore, cookiesStore] = await Promise.all([
      headers(),
      cookies(),
    ]);
    return {
      headers: headersStore as ReadonlyHeaders,
      cookies: cookiesStore as ReadonlyRequestCookies,
    };
  },
  isFrameworkSignal: isInternalNextError,
};

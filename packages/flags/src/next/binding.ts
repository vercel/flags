import { type FrameworkBinding, getFramework } from '../lib/framework';
import type { ReadonlyHeaders } from '../spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';
import { isInternalNextError } from './is-internal-next-error';

// An async import, because Turbopack fails in the Pages Router when
// next/headers is imported at the top level. The module is kept, so that
// each later call needs no extra await.
let headersModulePromise: Promise<typeof import('next/headers')> | undefined;
let headersModule: typeof import('next/headers') | undefined;

async function loadHeadersModule(): Promise<typeof import('next/headers')> {
  if (!headersModulePromise) {
    headersModulePromise = import('next/headers');
  }
  if (!headersModule) {
    headersModule = await headersModulePromise;
  }
  return headersModule;
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

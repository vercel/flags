/**
 * The framework binding of the Flags SDK for SvelteKit. `flags()` of
 * `@flags-sdk/sveltekit/vite` points the alias `flags/framework` to this
 * module. The application does not import it.
 *
 * It must not import `flags` at runtime, because `flags` imports this
 * module. Type imports are removed by the build.
 */

import type { FrameworkBinding, ReadonlyHeaders } from 'flags';
import { getRequestEvent } from '$app/server';
import { isSvelteKitControlFlow } from './is-sveltekit-control-flow';

/**
 * The environment of SvelteKit, which `process.env` does not have during
 * `vite dev`, e.g. the variables of `.env.local` after `vercel env pull`.
 *
 * @internal
 */
export async function loadSvelteKitEnv(): Promise<
  Record<string, string | undefined>
> {
  const env: Record<string, string | undefined> = {};
  try {
    // The static environment, also during prerendering, by name: the other
    // variables of the build stay out of the server bundle
    const { FLAGS_SECRET, FLAGS_PRECOMPUTE_SECRET } = await import(
      // @ts-expect-error SvelteKit provides this module
      '$env/static/private'
    );
    env.FLAGS_SECRET = FLAGS_SECRET;
    env.FLAGS_PRECOMPUTE_SECRET = FLAGS_PRECOMPUTE_SECRET;
  } catch {
    // Not available, e.g. outside of SvelteKit
  }
  try {
    // The OIDC token of `vercel env pull` is read at runtime: the static
    // environment would put the value of the build into the server bundle
    const { env: dynamicEnv } = await import(
      // @ts-expect-error SvelteKit provides this module
      '$env/dynamic/private'
    );
    env.VERCEL_OIDC_TOKEN = dynamicEnv.VERCEL_OIDC_TOKEN;
  } catch {
    // Not available, e.g. during prerendering, where process.env has it
  }
  return env;
}

/**
 * The request of SvelteKit: the event of the current request, from
 * `getRequestEvent()` of `$app/server`. A call outside of a request throws
 * the error of SvelteKit. In `reroute` and outside of a request, the
 * application passes the request, e.g. `precompute(flags, request)`.
 */
function currentHeaders(): Headers {
  return getRequestEvent().request.headers;
}

/**
 * The binding of SvelteKit. The headers of a request are the same object
 * during the request, so the SDK identifies the request by them. Without
 * cookies, the SDK reads the `Cookie` header.
 */
export const binding: FrameworkBinding = {
  name: 'sveltekit',
  async getHeaders() {
    return currentHeaders() as unknown as ReadonlyHeaders;
  },
  async getRequest() {
    return { headers: currentHeaders() as unknown as ReadonlyHeaders };
  },
  isFrameworkSignal: isSvelteKitControlFlow,
  loadEnv: loadSvelteKitEnv,
};

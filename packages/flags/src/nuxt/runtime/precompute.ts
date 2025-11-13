import type { H3Event } from 'h3';
import {
  appendHeader,
  defineEventHandler,
  getRequestURL,
  setResponseHeader,
  setResponseHeaders,
  setResponseStatus,
} from 'h3';
import * as s from '../../lib/serialization';
import { cartesianIterator, combineFlags } from '../../shared';
import type { JsonValue } from '../../types';
import type { Flag, FlagsArray } from '../types';

type ValuesArray = readonly any[];

/**
 * Resolves a list of flags
 * @param flags - list of flags
 * @param event - H3 event object
 * @returns - an array of evaluated flag values with one entry per flag
 */
async function evaluate<T extends FlagsArray>(
  flags: T,
  event: H3Event,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  return Promise.all(flags.map((flag) => flag(event))) as Promise<{
    [K in keyof T]: Awaited<ReturnType<T[K]>>;
  }>;
}

/**
 * Evaluate a list of feature flags and generate a signed string representing their values.
 *
 * This convenience function call combines `evaluate` and `serialize`.
 *
 * @param flags - list of flags
 * @param event - H3 event object
 * @param secret - The secret to use for signing the result
 * @returns - a string representing evaluated flags
 */
async function precomputeFlags<T extends FlagsArray>(
  flags: T,
  event: H3Event,
  secret: string,
): Promise<string> {
  const values = await evaluate(flags, event);
  return serialize(flags, values, secret);
}

/**
 * Takes a list of feature flag declarations and their values and turns them into a short, signed string.
 *
 * The returned string is signed to avoid enumeration attacks.
 *
 * When a feature flag's `options` contains the value the flag resolved to, then the encoding will store it's index only, leading to better compression. Boolean values and null are compressed even when the options are not declared on the flag.
 *
 * @param flags - A list of feature flags
 * @param values - A list of the values of the flags declared in `flags`
 * @param secret - The secret to use for signing the result
 * @returns - A short string representing the values.
 */
async function serialize(
  flags: FlagsArray,
  values: ValuesArray,
  secret: string,
) {
  return s.serialize(combineFlags(flags, values), flags, secret);
}

/**
 * Generates all permutations given a list of feature flags based on the options declared on each flag.
 * @param flags - The list of feature flags
 * @param filter - An optional filter function which gets called with each permutation.
 * @param secret - The secret sign the generated permutation with
 * @returns An array of strings representing each permutation
 */
async function generatePermutations(
  flags: FlagsArray,
  filter: ((permutation: Record<string, JsonValue>) => boolean) | null = null,
  secret: string,
): Promise<string[]> {
  const options = flags.map((flag) => {
    // infer boolean permutations if you don't declare any options.
    //
    // to explicitly opt out you need to use "filter"
    if (!flag.options) return [false, true];
    return flag.options.map((option) => option.value);
  });

  const list: Record<string, JsonValue>[] = [];

  for (const permutation of cartesianIterator(options)) {
    const permObject = permutation.reduce<Record<string, JsonValue>>(
      (acc, value, index) => {
        acc[(flags[index] as Flag<unknown>).key] = value;
        return acc;
      },
      {},
    );
    if (!filter || filter(permObject)) list.push(permObject);
  }

  return Promise.all(list.map((values) => s.serialize(values, flags, secret)));
}

/**
 * Handles precomputed routes by generating permutations during prerender
 * or redirecting at runtime to the appropriate precomputed route.
 *
 * @param event - The H3 event object
 * @param flags - The list of feature flags to precompute
 * @param options - Configuration options
 * @returns A promise that resolves to the response or void
 *
 * @example
 * ```ts
 * // server/middleware/precompute.ts
 * import { handlePrecomputedPaths } from '@vercel/flags/nuxt';
 * import { exampleFlag, featureToggleFlag } from '#flags';
 *
 * export default defineEventHandler((event) => {
 *   return handlePrecomputedPaths(event, [exampleFlag, featureToggleFlag]);
 * });
 * ```
 *
 * @example
 * ```ts
 * // server/routes/[...].ts - Conditional handling
 * export default defineEventHandler((event) => {
 *   if (event.path.startsWith('/special')) {
 *     return handlePrecomputedPaths(event, [exampleFlag]);
 *   }
 *   // ... handle other routes
 * });
 * ```
 */
export function handlePrecomputedPaths(
  event: H3Event,
  flags: FlagsArray,
  options?: {
    /**
     * Optional filter function to exclude certain flag permutations
     */
    filter?: ((permutation: Record<string, any>) => boolean) | null;
    /**
     * Optional secret override (defaults to process.env.FLAGS_SECRET)
     */
    secret?: string;
  },
): Promise<Response | Uint8Array | null | undefined> {
  const secret = options?.secret ?? process.env.FLAGS_SECRET;
  if (!secret) {
    throw new Error(
      'flags: handlePrecomputedPaths requires FLAGS_SECRET to be set',
    );
  }

  if (import.meta.prerender) {
    return handlePrerender(event, flags, secret, options?.filter ?? null);
  }

  return handleRuntime(event, flags, secret);
}

const flagMap = new Map<string, { hash: string; flags: FlagsArray }>();

/**
 * A middleware used by `flags` to ensure that during prerendering, the flag hash
 * is stored in the event context. Do not use this middleware directly.
 * @internal
 */
export const prerenderMiddleware = defineEventHandler(async (event) => {
  if (import.meta.prerender) {
    const result = flagMap.get(event.path);
    if (result) {
      // save the hash in the context to encode the flag value for when the flag is used
      event.context.precomputedFlags = result;
    }
  }
});

async function handlePrerender(
  event: H3Event,
  flags: FlagsArray,
  secret: string,
  filter: ((permutation: Record<string, any>) => boolean) | null,
) {
  // if we are prerendering a hash-prefixed path
  if (event.context.precomputedFlags) {
    return;
  }

  const permutations = await generatePermutations(flags, filter, secret);
  // we save the possible permutations for this route into a runtime, bundled storage
  // which nitro can access at runtime

  // @ts-expect-error this will be auto-imported by nitro
  // biome-ignore lint/correctness/useHookAtTopLevel: this is not a react hook
  const storage = useStorage('flags-precompute');
  await storage.setItem(`${event.path}.json`, permutations);

  for (const p of permutations) {
    flagMap.set(`/${p}${event.path}`, { hash: p, flags });
  }

  // ... and tell nitro to prerender hash-prefixed versions of this URL
  appendHeader(
    event,
    'x-nitro-prerender',
    permutations
      .map((p) => encodeURIComponent(`/${p}${event.path}`))
      .join(', '),
  );

  // skip prerendering this route
  setResponseHeader(event, 'content-type', 'text/html; x-skip-prerender=1');
  return null;
}

interface CachedResponse {
  bytes: Uint8Array;
  status: number;
  headers: Record<string, string>;
}
const responseCache = new Map<
  string,
  CachedResponse | Promise<CachedResponse>
>();

async function handleRuntime(
  event: H3Event,
  flags: FlagsArray,
  secret: string,
) {
  // @ts-expect-error this will be auto-imported by nitro
  // biome-ignore lint/correctness/useHookAtTopLevel: this is not a react hook
  const storage = useStorage('flags-precompute');

  const hashes = await storage.getItem(`${event.path}.json`);
  if (!Array.isArray(hashes) || hashes.length === 0) {
    return;
  }

  // Check if this hash exists in our prerendered set
  const hash = await precomputeFlags(flags, event, secret);
  if (!hashes.includes(hash)) {
    // we'll continue rendering the page in this case
    return;
  }

  const key = `/${hash}${event.path}`;
  const value = responseCache.get(key);
  if (value) {
    const res = await value;
    setResponseHeaders(event, res.headers);
    setResponseStatus(event, res.status);
    return res.bytes;
  }

  const fetchPromise = fetch(constructHashedURL(event, hash), {
    redirect: 'follow',
  });
  const cachedPromise = fetchPromise.then(async (res) => {
    const cachedResponse = await getCachedResponse(res.clone());
    responseCache.set(key, cachedResponse);
    return cachedResponse;
  });
  responseCache.set(key, cachedPromise);
  event.waitUntil(cachedPromise);

  return fetchPromise;
}

function constructHashedURL(event: H3Event, hash: string) {
  const url = getRequestURL(event, {
    xForwardedHost: true,
    xForwardedProto: true,
  });
  url.pathname = `/${hash}${event.path}`;

  return url;
}

async function getCachedResponse(res: Response): Promise<CachedResponse> {
  return {
    headers: Object.fromEntries(res.headers.entries()),
    status: res.status,
    bytes: new Uint8Array(await res.arrayBuffer()),
  };
}

import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingHttpHeaders } from 'node:http';
import { trace } from '../lib/tracing';
import { evaluateFlags } from '../shared/evaluate';
import { applyResult, getEntities } from '../shared/evaluation';
import { readOverrides } from '../shared/overrides';
import { sealCookies, sealHeaders, transformToHeaders } from '../shared/seal';
import type { ReadonlyHeaders } from '../spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';
import type {
  Decide,
  FlagDeclaration,
  ResolvedFlagDeclaration,
} from '../types';
import { isInternalNextError } from './is-internal-next-error';
import type { Flag, PagesRouterRequest } from './types';

// Re-export the bulk markers from their shared home so `flag()` (which stamps
// them) and existing importers keep importing from `./evaluate`.
export { BULK_IDENTIFY_REF, BULKABLE } from '../shared/evaluate';

interface BulkStoreData {
  headers: ReadonlyHeaders;
  cookies: ReadonlyRequestCookies;
  dedupeCacheKey: Headers | IncomingHttpHeaders;
  overrides: Record<string, any> | null;
}

const bulkStore = new AsyncLocalStorage<BulkStoreData>();

let headersModulePromise: Promise<typeof import('next/headers')> | undefined;
let headersModule: typeof import('next/headers') | undefined;

type Run<ValueType, EntitiesType> = (options: {
  entities?: EntitiesType;
  identify?:
    | FlagDeclaration<ValueType, EntitiesType>['identify']
    | EntitiesType;
  /**
   * For Pages Router only
   */
  request?: PagesRouterRequest;
}) => Promise<ValueType>;

/**
 * Builds the runtime function used by a single flag. Handles Pages Router,
 * App Router, and reuse of pre-read data when called from inside `evaluate()`.
 */
export function getRun<ValueType, EntitiesType>(
  definition: ResolvedFlagDeclaration<ValueType, EntitiesType>,
  decide: Decide<ValueType, EntitiesType>,
): Run<ValueType, EntitiesType> {
  // use cache to guarantee flags only decide once per request
  return async function run(options): Promise<ValueType> {
    let readonlyHeaders: ReadonlyHeaders;
    let readonlyCookies: ReadonlyRequestCookies;
    let dedupeCacheKey: Headers | IncomingHttpHeaders;

    // Check if running inside evaluate() — reuse pre-read headers/cookies/overrides
    const bulkData = bulkStore.getStore();

    let overrides: Record<string, any> | null;

    if (options.request) {
      // pages router
      const headers = transformToHeaders(options.request.headers);
      readonlyHeaders = sealHeaders(headers);
      readonlyCookies = sealCookies(headers);
      dedupeCacheKey = options.request.headers;

      overrides = await readOverrides(readonlyCookies);
    } else if (bulkData) {
      // app router — evaluate() mode, everything pre-read
      readonlyHeaders = bulkData.headers;
      readonlyCookies = bulkData.cookies;
      dedupeCacheKey = bulkData.dedupeCacheKey;
      overrides = bulkData.overrides;
    } else {
      // app router

      // async import required as turbopack errors in Pages Router
      // when next/headers is imported at the top-level.
      //
      // cache import so we don't await on every call since this adds
      // additional microtask queue overhead
      if (!headersModulePromise) headersModulePromise = import('next/headers');
      if (!headersModule) headersModule = await headersModulePromise;
      const { headers, cookies } = headersModule;

      const [headersStore, cookiesStore] = await Promise.all([
        headers(),
        cookies(),
      ]);
      readonlyHeaders = headersStore as ReadonlyHeaders;
      readonlyCookies = cookiesStore as ReadonlyRequestCookies;
      dedupeCacheKey = headersStore;

      overrides = await readOverrides(readonlyCookies);
    }

    // the flag is being used in app router
    // skip microtask if identify does not exist
    const entities = options.identify
      ? ((await getEntities(
          options.identify,
          dedupeCacheKey,
          readonlyHeaders,
          readonlyCookies,
        )) as EntitiesType | undefined)
      : undefined;

    const entitiesKey = JSON.stringify(entities) ?? '';

    return applyResult({
      definition,
      readonlyHeaders,
      entitiesKey,
      overrides,
      isFrameworkError: isInternalNextError,
      produce: () =>
        decide({
          // @ts-expect-error TypeScript will not be able to process `getPrecomputed` when added to `Decide`. It is, however, part of the `Adapter` type
          defaultValue: definition.defaultValue,
          headers: readonlyHeaders,
          cookies: readonlyCookies,
          entities,
        }),
    });
  };
}

// Distributive value extraction. `Flag` is itself a union
// (AppRouterFlag | PagesRouterFlag | PrecomputedFlag), so inferring V against
// a union element type only works when the conditional's check type is a
// naked type parameter — hence the helper.
type BulkValue<F> = F extends Flag<infer V, any> ? V : never;

type EvaluateRequest = PagesRouterRequest | Request;

/**
 * Resolves a set of flags in a single call.
 *
 * Pre-reads headers, cookies, and the override cookie once for the whole
 * batch, then partitions flags by `(adapterId, identify)` so adapters that
 * implement `bulkDecide` can evaluate an entire group through a single call.
 * Flags whose adapters don't opt into bulk evaluation (no `adapterId` or no
 * `bulkDecide`) and flags with an inline `decide` fall back to the per-flag
 * path — they still benefit from the shared pre-read of headers, cookies, and
 * overrides.
 *
 * Accepts either an array of flags (positional results) or an object whose
 * values are flags (keyed results).
 *
 * Pass a `request` as the second argument when calling outside App Router —
 * an `IncomingMessage` from Pages Router (`getServerSideProps`, API routes)
 * or a `NextRequest` / Web `Request` from routing middleware. Without it,
 * `evaluate()` reads from `next/headers`, which is only available in App
 * Router and routing middleware.
 */
export function evaluate<const T extends readonly Flag<any, any>[]>(
  flags: T,
  request?: EvaluateRequest,
): Promise<{ [K in keyof T]: BulkValue<T[K]> }>;
export function evaluate<T extends Record<string, Flag<any, any>>>(
  flags: T,
  request?: EvaluateRequest,
): Promise<{ [K in keyof T]: BulkValue<T[K]> }>;
export function evaluate(
  flags: Record<string, Flag<any, any>> | readonly Flag<any, any>[],
  request?: EvaluateRequest,
): Promise<any> {
  // Non-async wrapper so the returned promise is the traced one verbatim — no
  // extra microtask. `trace` short-circuits to `evaluateImpl` when no tracer
  // is registered.
  return tracedEvaluate(flags, request);
}

const tracedEvaluate = trace(evaluateImpl, {
  name: 'evaluate',
  isVerboseTrace: false,
  attributesSuccess: (result) => ({
    flagCount: Array.isArray(result)
      ? result.length
      : Object.keys(result).length,
  }),
});

async function evaluateImpl(
  flags: Record<string, Flag<any, any>> | readonly Flag<any, any>[],
  request?: EvaluateRequest,
): Promise<any> {
  // Skip the `next/headers` read when there's nothing to evaluate. This also
  // lets `precompute([])` return `__no_flags__` outside a request scope (e.g.
  // during static generation), which is the documented behavior of an empty
  // precompute group.
  if (
    Array.isArray(flags) ? flags.length === 0 : Object.keys(flags).length === 0
  ) {
    return Array.isArray(flags) ? [] : {};
  }

  let readonlyHeaders: ReadonlyHeaders;
  let readonlyCookies: ReadonlyRequestCookies;
  let dedupeCacheKey: Headers | IncomingHttpHeaders;

  if (request) {
    // Derive headers/cookies from the request, skipping the `next/headers`
    // import. Discriminate by whether `.headers` is already a `Headers`
    // instance (NextRequest / Web Request) or an `IncomingHttpHeaders` plain
    // object (Pages Router `IncomingMessage`).
    const headers =
      request.headers instanceof Headers
        ? request.headers
        : transformToHeaders(request.headers);
    readonlyHeaders = sealHeaders(headers);
    readonlyCookies = sealCookies(headers);
    dedupeCacheKey = request.headers;
  } else {
    // app router — read headers & cookies via `next/headers`.
    if (!headersModulePromise) headersModulePromise = import('next/headers');
    if (!headersModule) headersModule = await headersModulePromise;
    const { headers, cookies } = headersModule;

    const [headersStore, cookiesStore] = await Promise.all([
      headers(),
      cookies(),
    ]);

    readonlyHeaders = headersStore as ReadonlyHeaders;
    readonlyCookies = cookiesStore as ReadonlyRequestCookies;
    dedupeCacheKey = headersStore;
  }

  // Read overrides once
  const overrides = await readOverrides(readonlyCookies);

  const storeData: BulkStoreData = {
    headers: readonlyHeaders,
    cookies: readonlyCookies,
    dedupeCacheKey,
    overrides,
  };

  // Run inside `bulkStore` so standalone flags invoked via `flagFn()` reuse the
  // pre-read headers/cookies/overrides (see `getRun`) instead of reading
  // `next/headers` again.
  return bulkStore.run(storeData, () =>
    evaluateFlags({
      flags,
      readonlyHeaders,
      readonlyCookies,
      dedupeCacheKey,
      overrides,
      isFrameworkError: isInternalNextError,
      invokeStandalone: (flagFn) => flagFn(),
    }),
  );
}

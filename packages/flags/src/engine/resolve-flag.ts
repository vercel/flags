import { internalReportValue, reportValue } from '../lib/report-value';
import { setSpanAttribute } from '../lib/tracing';
import type { Identify, JsonValue } from '../types';
import {
  getCachedValuePromise,
  setCachedValuePromise,
} from './evaluation-cache';
import type { RequestContext, ResolveFlagOptions } from './types';

/**
 * Per-request deduplication of identify calls.
 * Maps cacheKey -> (identify function -> entities promise)
 */
const identifyCache = new WeakMap<
  object,
  Map<Identify<unknown>, ReturnType<Identify<unknown>>>
>();

async function getEntities<EntitiesType>(
  identify: Identify<EntitiesType>,
  context: RequestContext,
): Promise<EntitiesType | undefined> {
  let byRequest = identifyCache.get(context.cacheKey);
  if (!byRequest) {
    byRequest = new Map();
    identifyCache.set(context.cacheKey, byRequest);
  }

  if (!byRequest.has(identify as Identify<unknown>)) {
    const entities = identify({
      headers: context.headers,
      cookies: context.cookies,
    });
    byRequest.set(identify as Identify<unknown>, entities);
  }

  return (await byRequest.get(identify as Identify<unknown>)) as EntitiesType;
}

/**
 * Resolves a flag value using the shared pipeline.
 *
 * Frameworks call this after building a `RequestContext` from their
 * native request type. The pipeline:
 *
 * 1. Check evaluation cache
 * 2. Check overrides (from `vercel-flag-overrides` cookie)
 * 3. Identify entities (deduplicated per request)
 * 4. Call decide()
 * 5. Handle errors (fallback to defaultValue, re-throw framework errors)
 * 6. Cache and report the result
 */
export async function resolveFlag<ValueType extends JsonValue, EntitiesType>(
  context: RequestContext,
  options: ResolveFlagOptions<ValueType, EntitiesType>,
): Promise<ValueType> {
  // Read override cookie — skip microtask if cookie does not exist or is empty
  const overrideCookie = context.cookies.get('vercel-flag-overrides')?.value;
  const overrides =
    typeof overrideCookie === 'string' && overrideCookie !== ''
      ? await options.decryptOverrides(overrideCookie)
      : null;

  // Identify entities — skip microtask if identify does not exist
  const entities = options.identify
    ? await getEntities(options.identify, context)
    : undefined;

  // Check cache
  const entitiesKey = JSON.stringify(entities) ?? '';

  const cachedValue = getCachedValuePromise(
    context.cacheKey,
    options.key,
    entitiesKey,
  );
  if (cachedValue !== undefined) {
    setSpanAttribute('method', 'cached');
    return await cachedValue;
  }

  // Check overrides
  if (overrides && overrides[options.key] !== undefined) {
    setSpanAttribute('method', 'override');
    const decision = overrides[options.key] as ValueType;
    setCachedValuePromise(
      context.cacheKey,
      options.key,
      entitiesKey,
      Promise.resolve(decision),
    );
    internalReportValue(options.key, decision, {
      reason: 'override',
    });
    return decision;
  }

  // Call decide — normalize sync/async results and handle sync throws
  let decisionResult: ValueType | PromiseLike<ValueType>;
  try {
    decisionResult = options.decide({
      // @ts-expect-error TypeScript will not be able to process `getPrecomputed` when added to `Decide`. It is, however, part of the `Adapter` type
      defaultValue: options.defaultValue,
      headers: context.headers,
      cookies: context.cookies,
      entities,
    });
  } catch (error) {
    decisionResult = Promise.reject(error);
  }

  const decisionPromise = Promise.resolve(decisionResult).then<
    ValueType,
    ValueType
  >(
    (value) => {
      if (value !== undefined) return value;
      if (options.defaultValue !== undefined) return options.defaultValue;
      throw new Error(
        `flags: Flag "${options.key}" must have a defaultValue or a decide function that returns a value`,
      );
    },
    (error: Error) => {
      if (options.shouldRethrowError?.(error)) throw error;

      // try to recover if defaultValue is set
      if (options.defaultValue !== undefined) {
        if (process.env.NODE_ENV === 'development') {
          console.info(
            `flags: Flag "${options.key}" is falling back to its defaultValue`,
          );
        } else {
          console.warn(
            `flags: Flag "${options.key}" is falling back to its defaultValue after catching the following error`,
            error,
          );
        }
        return options.defaultValue;
      }
      console.warn(`flags: Flag "${options.key}" could not be evaluated`);
      throw error;
    },
  );

  setCachedValuePromise(
    context.cacheKey,
    options.key,
    entitiesKey,
    decisionPromise,
  );

  const decision = await decisionPromise;

  if (options.config?.reportValue !== false) {
    reportValue(options.key, decision);
  }

  return decision;
}

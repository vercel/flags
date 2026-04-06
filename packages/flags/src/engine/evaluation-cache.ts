/**
 * A three-level WeakMap for per-request flag evaluation deduplication.
 *
 * Structure: cacheKey -> flagKey -> entitiesKey -> valuePromise
 *
 * The `cacheKey` is an object reference (typically Headers or a request object)
 * that is the same for the duration of a single request, ensuring values are
 * cached per-request via WeakMap.
 */
const evaluationCache = new WeakMap<
  object,
  Map</* flagKey */ string, Map</* entitiesKey */ string, any>>
>();

export function getCachedValuePromise(
  cacheKey: object,
  flagKey: string,
  entitiesKey: string,
): any {
  return evaluationCache.get(cacheKey)?.get(flagKey)?.get(entitiesKey);
}

export function setCachedValuePromise(
  cacheKey: object,
  flagKey: string,
  entitiesKey: string,
  flagValue: any,
): void {
  const byKey = evaluationCache.get(cacheKey);

  if (!byKey) {
    evaluationCache.set(
      cacheKey,
      new Map([[flagKey, new Map([[entitiesKey, flagValue]])]]),
    );
    return;
  }

  const byFlagKey = byKey.get(flagKey);
  if (!byFlagKey) {
    byKey.set(flagKey, new Map([[entitiesKey, flagValue]]));
    return;
  }

  byFlagKey.set(entitiesKey, flagValue);
}

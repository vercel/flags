// a map of (headers, flagKey, entitiesKey) => value
const evaluationCache = new WeakMap<
  any,
  Map</* flagKey */ string, Map</* entitiesKey */ string, any>>
>();

export function getCachedValuePromise(
  requestCacheKey: any,
  flagKey: string,
  entitiesKey: string,
): any {
  const map = evaluationCache.get(requestCacheKey)?.get(flagKey);
  if (!map) return undefined;
  return map.get(entitiesKey);
}

export function setCachedValuePromise(
  requestCacheKey: any,
  flagKey: string,
  entitiesKey: string,
  flagValue: any,
): any {
  const byHeaders = evaluationCache.get(requestCacheKey);

  if (!byHeaders) {
    evaluationCache.set(
      requestCacheKey,
      new Map([[flagKey, new Map([[entitiesKey, flagValue]])]]),
    );
    return;
  }

  const byFlagKey = byHeaders.get(flagKey);
  if (!byFlagKey) {
    byHeaders.set(flagKey, new Map([[entitiesKey, flagValue]]));
    return;
  }

  byFlagKey.set(entitiesKey, flagValue);
}

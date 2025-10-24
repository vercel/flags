/** This file is an entry point for flags/utils, so its exports are public */
import type { EdgeConfigClient } from '@vercel/edge-config';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Returns a patched version of the EdgeConfigClient that cache reads
 * for the duration of a request.
 *
 * Uses the headers as a cache key.
 */
export function createCachedEdgeConfigClient(
  edgeConfigClient: EdgeConfigClient,
): {
  /**
   * A patched version of the Edge Config client, which only
   * reads Edge Config once per request and caches the result
   * for the duration of the request.
   */
  client: EdgeConfigClient;
  run: <R>(headers: HeadersInit, fn: () => R) => R;
} {
  const store = new AsyncLocalStorage<WeakKey>();
  const cache = new WeakMap<WeakKey, Promise<unknown>>();

  const patchedEdgeConfigClient: EdgeConfigClient = {
    ...edgeConfigClient,
    get: async <T>(key: string) => {
      const h = store.getStore();
      if (h) {
        const cached = cache.get(h);
        if (cached) {
          return cached as Promise<T>;
        }
      }

      const promise = edgeConfigClient.get<T>(key);
      if (h) cache.set(h, promise);

      return promise;
    },
  };

  return {
    client: patchedEdgeConfigClient,
    // The "run" function puts the headers into the AsyncLocalStorage, which
    // allows the patchedEdgeConfigClient to read the headers without otherwise
    // having access to them.
    //
    // The patchedEdgeConfigClient then uses the headers as a cache key to
    // deduplicate Edge Config reads for the duration of a request.
    //
    // Performance wise it would actually be fine to read Edge Config on every
    // flag evaluation, but this would also cause a lot of unnecessary reads,
    // and as Edge Config is charged per read, this would cause unnecessary charges.
    //
    // So this approach helps with performance and ensures a fair usage of Edge Config.
    run: store.run.bind(store),
  };
}

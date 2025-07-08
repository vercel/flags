enum Status {
  UNTERMINATED = 0,
  TERMINATED = 1,
  ERRORED = 2,
}

type RequestStore<T> = WeakMap<Headers, CacheNode<T>>;

type CacheNode<T> = {
  s: Status;
  v: T | undefined | unknown;
  o: WeakMap<Function | Object, CacheNode<T>> | null;
  p: Map<
    string | number | null | undefined | symbol | boolean,
    CacheNode<T>
  > | null;
};

function createCacheNode<T>(): CacheNode<T> {
  return {
    s: Status.UNTERMINATED,
    v: undefined,
    o: null,
    p: null,
  };
}

/**
 * We use a registry to store the request store for each deduped function.
 *
 * This is necessary as we don't want to attach the request store to the deduped
 * to retain its original type, and we need to be able to clear the cache for the
 * current request.
 */
const cacheRegistry = new WeakMap<Function, RequestStore<unknown>>();

/**
 * A middleware-friendly version of React.cache.
 *
 * Given the same arguments, the function wrapped by this function will only ever run once for the duration of a request.
 *
 * React.cache should not be used in middleware as it would bring all of react
 * into middleware, thus leading to an unnecessarily large middleware bundle.
 *
 * This function is a polyfill that will eventually land in Next.js itself,
 * at which point it will be removed from `flags/next`.
 *
 * This function will turn any sync function async, since we rely on the
 * headers() API to dedupe, which is async.
 */
export function dedupe<A extends Array<unknown>, T>(
  fn: (...args: A) => T | Promise<T>,
): (...args: A) => Promise<T> {
  const requestStore: RequestStore<T> = new WeakMap<Headers, CacheNode<T>>();

  const dedupedFn = async function (this: unknown, ...args: A): Promise<T> {
    // async import required as turbopack errors in Pages Router
    // when next/headers is imported at the top-level
    const { headers } = await import('next/headers');

    const h = await headers();
    let cacheNode = requestStore.get(h);
    if (!cacheNode) {
      cacheNode = createCacheNode<T>();
      requestStore.set(h, cacheNode);
    }

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (
        typeof arg === 'function' ||
        (typeof arg === 'object' && arg !== null)
      ) {
        let objectCache: WeakMap<Function | Object, CacheNode<T>> | null =
          cacheNode.o;
        if (objectCache === null) {
          cacheNode.o = objectCache = new WeakMap();
        }
        const objectNode = objectCache.get(arg);
        if (objectNode === undefined) {
          cacheNode = createCacheNode();
          objectCache.set(arg, cacheNode);
        } else {
          cacheNode = objectNode;
        }
      } else {
        let primitiveCache: Map<unknown, CacheNode<T>> | null = cacheNode.p;
        if (primitiveCache === null) {
          cacheNode.p = primitiveCache = new Map();
        }
        const primitiveNode = primitiveCache.get(arg);
        if (primitiveNode === undefined) {
          cacheNode = createCacheNode();
          primitiveCache.set(arg, cacheNode);
        } else {
          cacheNode = primitiveNode;
        }
      }
    }

    if (cacheNode.s === Status.TERMINATED) {
      return cacheNode.v as T;
    }
    if (cacheNode.s === Status.ERRORED) {
      throw cacheNode.v;
    }

    try {
      const result = fn.apply(this, args);
      cacheNode.s = Status.TERMINATED;
      cacheNode.v = result;
      return result;
    } catch (error) {
      cacheNode.s = Status.ERRORED;
      cacheNode.v = error;
      throw error;
    }
  };

  cacheRegistry.set(dedupedFn, requestStore);
  return dedupedFn;
}

/**
 * Clears the cached value of a deduped function for the current request.
 *
 * This function is useful for resetting the cache after making changes to
 * the underlying cached information.
 */
export async function clearDedupeCacheForCurrentRequest(
  dedupedFn: (...args: unknown[]) => unknown,
) {
  if (typeof dedupedFn !== 'function') {
    throw new Error('dedupe: not a function');
  }
  const requestStore = cacheRegistry.get(dedupedFn);

  if (!requestStore) {
    throw new Error('dedupe: cache not found');
  }
  const { headers } = await import('next/headers');
  const h = await headers();
  return requestStore.delete(h);
}

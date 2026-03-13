/**
 * Exports for Next.js App Router
 *
 * There is also index.default.ts which targets Next.js specifically.
 * If you update this file, please update index.default.ts as well.
 *
 * Try keeping this file small. Export through index.common and index.make.
 *
 * This file should stay equivalent to index.default.ts, except that it
 * declares "use cache".
 */

import { cacheLife } from 'next/cache';
import * as fns from './controller-fns';
import { createCreateRawClient } from './create-raw-client';
import { make } from './index.make';

function setCacheLife(): void {
  try {
    // Working around a limitation of cacheLife in older Next.js versions
    // where stale was required to be greater than expire if set concurrently.
    // Instead we do this over two calls.
    cacheLife({ revalidate: 0, expire: 0 });
    cacheLife({ stale: 60 });
  } catch {
    // if we error setting cache life it means we are not in a cache scope
    // The only time that might happen is if next-js entrypoint is used
    // in a context that doesn't process the "use cache" directive.
    // In these contexts we don't really need the cache life to be set because there
    // is no Cache Component semantics
  }
}

const cachedFns: Parameters<typeof createCreateRawClient>[0] = {
  initialize: async (...args) => {
    'use cache';
    setCacheLife();

    return fns.initialize(...args);
  },
  shutdown: async (...args) => {
    'use cache';
    setCacheLife();
    return fns.shutdown(...args);
  },
  getDatafile: async (...args) => {
    'use cache';
    setCacheLife();
    return fns.getDatafile(...args);
  },
  getFallbackDatafile: async (...args) => {
    'use cache';
    setCacheLife();
    return fns.getFallbackDatafile(...args);
  },
  evaluate: async (...args) => {
    'use cache';
    setCacheLife();
    return fns.evaluate(...args);
  },
};

export * from './index.common';

// no JSDoc needed here since editors will use the one if index.default.ts
export const { flagsClient, resetDefaultFlagsClient, createClient } = make(
  createCreateRawClient(cachedFns),
);

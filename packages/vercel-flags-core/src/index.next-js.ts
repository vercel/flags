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
import { createCreateRawClient } from './create-raw-client';
import { make } from './index.make';
import * as fns from './raw-client';

export const cachedFns: typeof fns = {
  initialize: async (...args) => {
    'use cache';
    cacheLife({ revalidate: 0, expire: 0 });
    cacheLife({ stale: 60 });
    return fns.initialize(...args);
  },
  shutdown: async (...args) => {
    'use cache';
    cacheLife({ revalidate: 0, expire: 0 });
    cacheLife({ stale: 60 });
    return fns.shutdown(...args);
  },
  getMetadata: async (...args) => {
    'use cache';
    cacheLife({ revalidate: 0, expire: 0 });
    cacheLife({ stale: 60 });
    return fns.getMetadata(...args);
  },
  ensureFallback: async (...args) => {
    'use cache';
    cacheLife({ revalidate: 0, expire: 0 });
    cacheLife({ stale: 60 });
    return fns.ensureFallback(...args);
  },
  evaluate: async (...args) => {
    'use cache';
    cacheLife({ revalidate: 0, expire: 0 });
    cacheLife({ stale: 60 });
    return fns.evaluate(...args);
  },
};

export * from './index.common';
export const createRawClient = createCreateRawClient(cachedFns);

// no JSDoc needed here since editors will use the one if index.default.ts
export const { flagsClient, resetDefaultFlagsClient, createClient } =
  make(createRawClient);

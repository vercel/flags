import { cacheLife } from 'next/cache';
import { createCreateRawClient } from './create-raw-client';
import { make } from './index.make';
import * as fns from './raw-client';

export const cachedFns: typeof fns = {
  initialize: (...args) => {
    'use cache';
    cacheLife({ revalidate: 0, expire: 0 });
    cacheLife({ stale: 60 });
    return fns.initialize(...args);
  },
  shutdown: (...args) => {
    'use cache';
    cacheLife({ revalidate: 0, expire: 0 });
    cacheLife({ stale: 60 });
    return fns.shutdown(...args);
  },
  getMetadata: (...args) => {
    'use cache';
    cacheLife({ revalidate: 0, expire: 0 });
    cacheLife({ stale: 60 });
    return fns.getMetadata(...args);
  },
  ensureFallback: (...args) => {
    'use cache';
    cacheLife({ revalidate: 0, expire: 0 });
    cacheLife({ stale: 60 });
    return fns.ensureFallback(...args);
  },
  evaluate: (...args) => {
    'use cache';
    cacheLife({ revalidate: 0, expire: 0 });
    cacheLife({ stale: 60 });
    return fns.evaluate(...args);
  },
};

export * from './index.common';
export const createRawClient = createCreateRawClient(cachedFns);

export const { flagsClient, resetDefaultFlagsClient, createClient } =
  make(createRawClient);

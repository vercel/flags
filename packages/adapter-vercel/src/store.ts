import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * A temporary store to avoid reading the Edge Config for every flag,
 * and instead reading it once per request.
 */
export const store = new AsyncLocalStorage<WeakKey>();

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * A store to avoid reading the Edge Config for every flag evaluation,
 * and instead reading it once per request.
 */
export const store = new AsyncLocalStorage<WeakKey>();

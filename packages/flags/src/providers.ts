import type { Provider } from './types';

const providers = new Set<Provider>();
const initializations = new WeakMap<Provider, Promise<void>>();

/**
 * Makes a provider known to the runtime, so it can be initialized before the
 * first evaluation.
 *
 * @internal
 */
export function registerProvider(provider: Provider): void {
  providers.add(provider);
}

/**
 * @internal
 */
export function getRegisteredProviders(): ReadonlySet<Provider> {
  return providers;
}

/**
 * Initializes a provider once. Concurrent callers share the same
 * initialization. A failed initialization is retried on the next call.
 *
 * @internal
 */
export function initializeProvider(provider: Provider): Promise<void> {
  let initialization = initializations.get(provider);
  if (!initialization) {
    initialization = Promise.resolve()
      .then(() => provider.initialize?.())
      .catch((error: unknown) => {
        initializations.delete(provider);
        throw error;
      });
    initializations.set(provider, initialization);
  }
  return initialization;
}

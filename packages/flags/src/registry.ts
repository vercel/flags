import type { Connection } from './connection';
import type { Provider } from './types';

const connections = new Set<Connection>();
const initializations = new WeakMap<Provider, Promise<void>>();

/**
 * Makes a connection known to the runtime, so its provider can be initialized
 * before the first evaluation.
 *
 * @internal
 */
export function registerConnection(connection: Connection): void {
  connections.add(connection);
}

/**
 * @internal
 */
export function getRegisteredConnections(): ReadonlySet<Connection> {
  return connections;
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

import { type Connection, isConnection } from './connection';
import { isExportedFlag } from './manifest';
import { runtime } from './runtime';

/**
 * Registers connections with the runtime.
 *
 * Use this when you have the connections themselves. The runtime then
 * initializes their providers in `runtime.onInit()`, before the first request.
 *
 * Connections of flags are registered when the flag is defined, so you only
 * need this for connections whose flags are defined later, e.g. in modules
 * which are imported lazily. To register the flags of a module, use
 * `registerFlags` instead.
 *
 * @example
 * ```ts
 * registerConnections([launchdarkly, inMemory]);
 * ```
 */
export function registerConnections(connections: Iterable<Connection>): void {
  for (const connection of connections) {
    if (!isConnection(connection)) {
      throw new Error(
        'flags: registerConnections only accepts connections returned by defineConnection.',
      );
    }
    runtime.registerConnection(connection);
  }
}

/**
 * Registers the connections of all flags a module exports.
 *
 * Use this with the exports of a module which only exports flags, e.g. a
 * module with the `'use flags'` directive. The framework plugins call it for
 * these modules, e.g. `withFlags` of `flags/next/plugin`. Without a plugin,
 * call it with the module namespace object.
 *
 * A flag is any object or function with a `key`, e.g. a flag of
 * `defineFlag`. Throws if an export is not a flag. To register connections
 * directly, use `registerConnections` instead.
 *
 * @example
 * ```ts
 * import * as flags from './flags';
 *
 * registerFlags(flags);
 * ```
 */
export function registerFlags(moduleExports: Record<string, unknown>): void {
  const flags = Object.entries(moduleExports).map(([name, value]) => {
    if (!isExportedFlag(value)) {
      throw new Error(
        `flags: registerFlags expects only flags, but export "${name}" is not a flag.`,
      );
    }
    return value as { connection?: unknown };
  });
  for (const flag of flags) {
    const { connection } = flag;
    // A flag without a connection uses the default connection, which the
    // runtime selects at each evaluation
    if (!isConnection(connection) || connection === runtime.defaultConnection) {
      continue;
    }
    runtime.registerConnection(connection);
  }
}

import { type Connection, isConnection } from './connection';
import { isFlag } from './flag';
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
 * module with the `'use flags'` directive. Build tooling will call this for
 * you. Until then, you can call it with the module namespace object.
 *
 * Throws if an export is not a flag. To register connections directly, use
 * `registerConnections` instead.
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
    if (!isFlag(value)) {
      throw new Error(
        `flags: registerFlags expects only flags, but export "${name}" is not a flag.`,
      );
    }
    return value;
  });
  for (const flag of flags) runtime.registerConnection(flag.connection);
}

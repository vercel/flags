import { type Connection, isConnection } from './connection';
import { type FlagDefinition, runtime } from './runtime';

const flags = new WeakSet<object>();

/**
 * Returns whether the value was returned by `defineFlag`.
 *
 * @internal
 */
export function isFlag(value: unknown): value is Flag {
  return typeof value === 'function' && flags.has(value);
}

export interface FlagOptions<C extends Connection, K extends string>
  extends FlagDefinition {
  readonly key: K;
  readonly connection: C;
}

export type Flag<
  C extends Connection = Connection,
  K extends string = string,
> = (() => Promise<boolean>) & {
  readonly key: K;
  readonly defaultValue?: boolean;
  readonly connection: C;
};

/**
 * Declares a flag. Call the returned function to evaluate it.
 */
export function defineFlag<C extends Connection, const K extends string>(
  options: FlagOptions<C, K>,
): Flag<C, K> {
  const { key, defaultValue, connection } = options;

  if (!isConnection(connection)) {
    throw new Error(
      `flags: The connection of flag "${key}" must be returned by defineConnection.`,
    );
  }

  const definition = { key, defaultValue, connection };
  runtime.registerConnection(connection);

  const flag = Object.assign(() => runtime.evaluate(definition), definition);
  flags.add(flag);
  return flag;
}

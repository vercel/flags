import type { ConfiguredConnection } from './config';
import {
  type Connection,
  type ConnectionInput,
  isConnection,
} from './connection';
import { logger } from './logger';
import { type FlagDefinition, runtime } from './runtime';
import { sharedState } from './shared-state';
import type { FlagsRequest, Hook, HookHints } from './types';
import {
  type FlagObjectValue,
  type FlagOptionObject,
  type FlagOptionsOf,
  type FlagType,
  type FlagValue,
  type FlagValueFrom,
  hasType,
  isFlagType,
  isOption,
  normalizeOptions,
} from './value-types';

const { flags } = sharedState;

/**
 * Returns whether the value was returned by `defineFlag`.
 *
 * @internal
 */
export function isFlag(value: unknown): value is Flag {
  return typeof value === 'function' && flags.has(value);
}

/**
 * The options of a call of a flag or of `evaluate`.
 */
export interface EvaluationOptions<In> {
  /**
   * The first input of the chain which creates the evaluation context. It
   * goes to `getEvaluationContext` of the flag, or of the connection if the
   * flag has none.
   */
  evaluationContext: In;
  /**
   * OpenFeature hooks for this evaluation only. They run after the hooks of
   * the configuration and of the connection, and before the hooks of the
   * provider.
   */
  hooks?: readonly Hook[];
  /**
   * Hints which the hooks receive.
   */
  hookHints?: HookHints;
}

/**
 * The arguments of a call of a flag. The options are optional if the flag
 * accepts `undefined` as its evaluation context.
 */
export type EvaluationArgs<In> = undefined extends In
  ? [options?: Partial<EvaluationOptions<In>>]
  : [options: EvaluationOptions<In>];

export interface FlagOptions<
  C extends Connection,
  K extends string,
  In,
  T extends FlagType,
  O extends FlagOptionsOf<T>,
> {
  readonly key: K;
  /**
   * The type of the value. The default is `boolean`. Each other type must be
   * set here.
   */
  readonly type?: T;
  /**
   * Returned when the evaluation fails, after logging the error. If not set,
   * the error is thrown.
   */
  readonly defaultValue?: NoInfer<FlagValueFrom<T, O>>;
  /**
   * The values which the flag can have, e.g. for Flags Explorer. A value or
   * `{ value, label }`. With a fixed list, the type of the flag is the union
   * of the values, and a value that is not in the list fails.
   */
  readonly options?: O;
  /**
   * What the flag is for, e.g. for Flags Explorer.
   */
  readonly description?: string;
  /**
   * A connection returned by `defineConnection`. Without it, the flag uses
   * the default connection.
   */
  readonly connection?: C;
  /**
   * The middle step of the chain. Receives the evaluation context of the call
   * side, and returns the context for the connection. The type of `context`
   * defines what the call side must give.
   *
   * Without it, the call side gives its context directly to the connection.
   *
   * @example
   * ```ts
   * getEvaluationContext: (context: { teamId: string }) => ({
   *   teamId: context.teamId,
   * }),
   * ```
   */
  getEvaluationContext?(
    context: In,
    request: FlagsRequest | undefined,
  ): ConnectionInput<C> | Promise<ConnectionInput<C>>;
}

export type Flag<
  C extends Connection = Connection,
  K extends string = string,
  In = ConnectionInput<C>,
  V extends FlagValue = boolean,
> = ((...args: EvaluationArgs<In>) => Promise<V>) & {
  readonly key: K;
  readonly type: FlagType;
  readonly defaultValue?: V;
  /**
   * The options, always as objects with a value.
   */
  readonly options?: readonly FlagOptionObject<V>[];
  readonly description?: string;
  readonly connection: C;
  getEvaluationContext?(
    context: In,
    request: FlagsRequest | undefined,
  ): ConnectionInput<C> | Promise<ConnectionInput<C>>;
};

/**
 * The general type of a default value, e.g. `string` for `'Welcome'`.
 */
type ValueTypeOf<D> = D extends boolean
  ? boolean
  : D extends string
    ? string
    : D extends number
      ? number
      : FlagObjectValue;

/**
 * Declares a flag. Call the returned function to evaluate it.
 *
 * @example
 * ```ts
 * // Uses the default connection
 * const flag = defineFlag({ key: 'new-checkout' });
 * // Uses a provider of your choice
 * const other = defineFlag({ key: 'new-checkout', connection });
 * await flag();
 * await flag({ evaluationContext: { teamId: 'team-1' } });
 * ```
 */
export function defineFlag<
  const K extends string,
  const T extends FlagType = 'boolean',
  const O extends FlagOptionsOf<T> = FlagOptionsOf<T>,
  C extends Connection = ConfiguredConnection,
  In = ConnectionInput<C>,
>(options: FlagOptions<C, K, In, T, O>): Flag<C, K, In, FlagValueFrom<T, O>>;
/**
 * Declares a boolean flag with a key. Short for `defineFlag({ key })`.
 *
 * @example
 * ```ts
 * const summerSale = defineFlag('summer-sale');
 * ```
 */
export function defineFlag<const K extends string>(
  key: K,
): Flag<
  ConfiguredConnection,
  K,
  ConnectionInput<ConfiguredConnection>,
  boolean
>;
/**
 * Declares a flag with a key and a default value. The type of the flag comes
 * from the default value. Short for `defineFlag({ key, type, defaultValue })`.
 *
 * @example
 * ```ts
 * const bannerText = defineFlag('banner-text', 'Welcome'); // string
 * ```
 */
export function defineFlag<const K extends string, D extends FlagValue>(
  key: K,
  defaultValue: D,
): Flag<
  ConfiguredConnection,
  K,
  ConnectionInput<ConfiguredConnection>,
  ValueTypeOf<D>
>;
/**
 * Declares a boolean flag of a connection. Short for
 * `defineFlag({ key, connection })`.
 *
 * @example
 * ```ts
 * const summerSale = defineFlag(launchdarkly, 'summer-sale');
 * ```
 */
export function defineFlag<C extends Connection, const K extends string>(
  connection: C,
  key: K,
): Flag<C, K, ConnectionInput<C>, boolean>;
/**
 * Declares a flag of a connection, with a default value. The type of the flag
 * comes from the default value. Short for
 * `defineFlag({ key, type, defaultValue, connection })`.
 *
 * @example
 * ```ts
 * const maxItems = defineFlag(launchdarkly, 'max-items', 10); // number
 * ```
 */
export function defineFlag<
  C extends Connection,
  const K extends string,
  D extends FlagValue,
>(
  connection: C,
  key: K,
  defaultValue: D,
): Flag<C, K, ConnectionInput<C>, ValueTypeOf<D>>;
export function defineFlag(...args: unknown[]): unknown {
  return defineFromOptions(toOptions(args));
}

/**
 * Converts the arguments of a short form into the options of the full form.
 */
function toOptions(
  args: unknown[],
): FlagOptions<Connection, string, unknown, FlagType, never> {
  const [first, second, third] = args;
  if (typeof first === 'string') {
    return withDefault({ key: first }, second, args.length > 1);
  }
  if (isConnection(first)) {
    if (typeof second !== 'string') {
      throw new TypeError('flags: The key of a flag must be a string.');
    }
    return withDefault(
      { key: second, connection: first },
      third,
      args.length > 2,
    );
  }
  if (typeof first === 'object' && first !== null) {
    // An object with a provider and a project looks like a connection, but
    // defineConnection did not return it
    if ('provider' in first && 'project' in first && !('key' in first)) {
      throw new Error(
        'flags: The connection of a flag must be returned by defineConnection.',
      );
    }
    return first as FlagOptions<Connection, string, unknown, FlagType, never>;
  }
  throw new TypeError(
    'flags: defineFlag expects a key, a connection and a key, or options.',
  );
}

function withDefault(
  options: { key: string; connection?: Connection },
  defaultValue: unknown,
  hasDefault: boolean,
): FlagOptions<Connection, string, unknown, FlagType, never> {
  if (!hasDefault || defaultValue === undefined) return options;
  return {
    ...options,
    type: typeOfValue(options.key, defaultValue),
    defaultValue: defaultValue as never,
  };
}

/**
 * The type of a flag of the short form, from its default value.
 */
function typeOfValue(key: string, value: unknown): FlagType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object' && value !== null) return 'object';
  throw new TypeError(
    `flags: The defaultValue of flag "${key}" must be a boolean, a string, a number or an object.`,
  );
}

function defineFromOptions(
  options: FlagOptions<Connection, string, unknown, FlagType, never>,
): Flag<Connection, string, unknown, FlagValue> {
  const { key, defaultValue, getEvaluationContext } = options;
  const explicit = options.connection;
  if (typeof key !== 'string') {
    throw new TypeError('flags: The key of a flag must be a string.');
  }
  if (
    options.description !== undefined &&
    typeof options.description !== 'string'
  ) {
    throw new TypeError(
      `flags: The description of flag "${key}" must be a string.`,
    );
  }
  const type: FlagType = options.type ?? 'boolean';

  if (!isFlagType(type)) {
    throw new TypeError(
      `flags: The type of flag "${key}" must be boolean, string, number or object.`,
    );
  }
  if (explicit !== undefined && !isConnection(explicit)) {
    throw new Error(
      `flags: The connection of flag "${key}" must be returned by defineConnection.`,
    );
  }
  const flagOptions = normalizeOptions(key, type, options.options);
  warnAboutValues(key, type, options.type, defaultValue, flagOptions);

  if (explicit) runtime.registerConnection(explicit);
  else runtime.markDefaultConnectionUsed();

  // The flag gives itself to the runtime, so that flag() and evaluate(flag)
  // share the cache of the request
  const flag: Flag<Connection, string, unknown, FlagValue> =
    Object.defineProperties(
      (options?: Partial<EvaluationOptions<unknown>>) =>
        runtime.evaluate(flag as FlagDefinition, options as never),
      {
        key: { value: key, enumerable: true },
        type: { value: type, enumerable: true },
        defaultValue: { value: defaultValue, enumerable: true },
        options: { value: flagOptions, enumerable: true },
        description: { value: options.description, enumerable: true },
        getEvaluationContext: { value: getEvaluationContext, enumerable: true },
        // Without a connection, the default connection at the time of the
        // evaluation, so the configuration can come later than the flag
        connection: {
          get: () => explicit ?? runtime.defaultConnection,
          enumerable: true,
        },
      },
    ) as unknown as Flag<Connection, string, unknown, FlagValue>;
  flags.add(flag);
  return flag;
}

/**
 * Warns about a defaultValue or options which do not fit the type, e.g. for
 * code without TypeScript. TypeScript shows the same problems as type errors.
 */
function warnAboutValues(
  key: string,
  type: FlagType,
  explicitType: FlagType | undefined,
  defaultValue: unknown,
  options: readonly FlagOptionObject<FlagValue>[] | undefined,
) {
  // Without a type, the flag is a boolean. Tell how to set a different type.
  const hint = explicitType ? '' : ' Set type to use a different type.';
  if (defaultValue !== undefined && !hasType(defaultValue, type)) {
    logger.warn(
      `flags: The defaultValue of flag "${key}" is not a ${type}.${hint}`,
    );
  }
  if (options?.some((option) => !hasType(option.value, type))) {
    logger.warn(`flags: An option of flag "${key}" is not a ${type}.${hint}`);
  }
  if (
    defaultValue !== undefined &&
    options !== undefined &&
    !isOption(defaultValue, options)
  ) {
    logger.warn(
      `flags: The defaultValue of flag "${key}" is not one of its options.`,
    );
  }
}

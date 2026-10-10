import type { ConfiguredConnection } from './config';
import {
  type Connection,
  type ConnectionInput,
  isConnection,
} from './connection';
import { logger } from './logger';
import { type FlagDefinition, runtime } from './runtime';
import { sharedState } from './shared-state';
import type { FlagsRequest } from './types';
import {
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
  readonly connection: C;
  getEvaluationContext?(
    context: In,
    request: FlagsRequest | undefined,
  ): ConnectionInput<C> | Promise<ConnectionInput<C>>;
};

/**
 * Declares a flag. Call the returned function to evaluate it.
 *
 * @example
 * ```ts
 * // Uses Vercel Flags
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
>(options: FlagOptions<C, K, In, T, O>): Flag<C, K, In, FlagValueFrom<T, O>> {
  const { key, defaultValue, getEvaluationContext } = options;
  const explicit = options.connection;
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
  else runtime.useDefaultConnection();

  // Without a connection, the runtime resolves the default connection at the
  // evaluation, so the configuration can come later than the flag
  const definition: FlagDefinition = {
    key,
    type,
    defaultValue: defaultValue as FlagValue | undefined,
    options: flagOptions,
    connection: explicit,
    getEvaluationContext,
  };
  const flag = Object.defineProperties(
    (options?: Partial<EvaluationOptions<In>>) =>
      runtime.evaluate(definition, options as never),
    {
      key: { value: key, enumerable: true },
      type: { value: type, enumerable: true },
      defaultValue: { value: defaultValue, enumerable: true },
      options: { value: flagOptions, enumerable: true },
      getEvaluationContext: { value: getEvaluationContext, enumerable: true },
      connection: {
        get: () => explicit ?? runtime.defaultConnection,
        enumerable: true,
      },
    },
  ) as unknown as Flag<C, K, In, FlagValueFrom<T, O>>;
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

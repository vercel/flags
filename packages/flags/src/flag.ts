import type { ConfiguredConnection } from './config';
import {
  type Connection,
  type ConnectionInput,
  isConnection,
} from './connection';
import { type FlagDefinition, runtime } from './runtime';
import { sharedState } from './shared-state';
import type { FlagsRequest } from './types';

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
  In = ConnectionInput<C>,
> extends Omit<FlagDefinition, 'connection'> {
  readonly key: K;
  /**
   * A connection returned by `defineConnection`. Without it, the flag uses
   * Vercel Flags: on a deployment of Vercel, or locally after `vercel link`
   * and `vercel env pull`. Otherwise, its evaluation throws.
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
> = ((...args: EvaluationArgs<In>) => Promise<boolean>) & {
  readonly key: K;
  readonly defaultValue?: boolean;
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
  C extends Connection = ConfiguredConnection,
  In = ConnectionInput<C>,
>(options: FlagOptions<C, K, In>): Flag<C, K, In> {
  const { key, defaultValue, getEvaluationContext } = options;
  const explicit = options.connection;

  if (explicit !== undefined && !isConnection(explicit)) {
    throw new Error(
      `flags: The connection of flag "${key}" must be returned by defineConnection.`,
    );
  }
  if (explicit) runtime.registerConnection(explicit);
  else runtime.useDefaultConnection();

  // Without a connection, the runtime resolves the default connection at the
  // evaluation, so the configuration can come later than the flag
  const definition: FlagDefinition = {
    key,
    defaultValue,
    connection: explicit,
    getEvaluationContext,
  };
  const flag = Object.defineProperties(
    (options?: Partial<EvaluationOptions<In>>) =>
      runtime.evaluate(definition, options as never),
    {
      key: { value: key, enumerable: true },
      defaultValue: { value: defaultValue, enumerable: true },
      getEvaluationContext: { value: getEvaluationContext, enumerable: true },
      connection: {
        get: () => explicit ?? runtime.defaultConnection,
        enumerable: true,
      },
    },
  ) as unknown as Flag<C, K, In>;
  flags.add(flag);
  return flag;
}

import {
  type Connection,
  type ConnectionInput,
  isConnection,
} from './connection';
import { type FlagDefinition, runtime } from './runtime';
import type { FlagsRequest } from './types';

const flags = new WeakSet<object>();

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
> extends FlagDefinition {
  readonly key: K;
  readonly connection: C;
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
 * const flag = defineFlag({ key: 'new-checkout', connection });
 * await flag();
 * await flag({ evaluationContext: { teamId: 'team-1' } });
 * ```
 */
export function defineFlag<
  C extends Connection,
  const K extends string,
  In = ConnectionInput<C>,
>(options: FlagOptions<C, K, In>): Flag<C, K, In> {
  const { key, defaultValue, connection, getEvaluationContext } = options;

  if (!isConnection(connection)) {
    throw new Error(
      `flags: The connection of flag "${key}" must be returned by defineConnection.`,
    );
  }

  const definition = { key, defaultValue, connection, getEvaluationContext };
  runtime.registerConnection(connection);

  const flag = Object.assign(
    (options?: Partial<EvaluationOptions<In>>) =>
      runtime.evaluate(definition as FlagDefinition, options as never),
    definition,
  ) as Flag<C, K, In>;
  flags.add(flag);
  return flag;
}

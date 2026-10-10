import type { ConfiguredConnection } from './config';
import type { Connection, ConnectionInput } from './connection';
import type { EvaluationArgs } from './flag';
import { type FlagDefinition, runtime } from './runtime';
import type { FlagsRequest } from './types';

type UnionToIntersection<U> = (
  U extends unknown
    ? (value: U) => void
    : never
) extends (value: infer I) => void
  ? I
  : never;

/**
 * The evaluation context which the call side gives to a flag. It is the type
 * of `context` of `getEvaluationContext` of the flag. If the flag has none,
 * it is the type of the connection.
 */
export type FlagEvaluationContext<F extends FlagDefinition> = F extends {
  getEvaluationContext?(
    context: infer In,
    request: FlagsRequest | undefined,
  ): unknown;
}
  ? unknown extends In
    ? ConnectionInput<ConnectionOf<F>>
    : In
  : ConnectionInput<ConnectionOf<F>>;

/**
 * The connection of a flag. Without a connection, the configured default
 * connection.
 */
type ConnectionOf<F extends FlagDefinition> = F extends {
  readonly connection: infer C extends Connection;
}
  ? C
  : ConfiguredConnection;

/**
 * The evaluation context which `evaluate` accepts for a list of flags.
 *
 * The call side gives the same object to each flag. Thus, it must be valid
 * for each flag: it is the overlap (intersection) of their evaluation
 * contexts.
 */
export type EvaluateContext<F extends readonly FlagDefinition[]> =
  F extends readonly []
    ? undefined
    : UnionToIntersection<
          F[number] extends infer G
            ? G extends FlagDefinition
              ? { context: FlagEvaluationContext<G> }
              : never
            : never
        > extends { context: infer C }
      ? C
      : never;

/**
 * The values of a list of flags, in the order of the list.
 */
export type EvaluateResults<F extends readonly FlagDefinition[]> = {
  -readonly [K in keyof F]: boolean;
};

export interface Evaluate {
  /**
   * Evaluates one flag.
   */
  <const F extends FlagDefinition>(
    flag: F,
    ...args: EvaluationArgs<FlagEvaluationContext<F>>
  ): Promise<boolean>;
  /**
   * Evaluates several flags. Returns their values in the order of `flags`.
   */
  <const F extends readonly FlagDefinition[]>(
    flags: F,
    ...args: EvaluationArgs<EvaluateContext<F>>
  ): Promise<EvaluateResults<F>>;
}

/**
 * Evaluates one flag or several flags.
 *
 * `evaluationContext` is the first input of the chain which creates the
 * evaluation context of each flag: it goes to `getEvaluationContext` of the
 * flag, then of the connection, and then to the provider. For several flags,
 * each flag receives the same object, so each step runs once per request for
 * all of them.
 *
 * Each flag which fails returns its `defaultValue`, after logging the error.
 * If a flag without `defaultValue` fails, the call rejects with its
 * `FlagEvaluationError`.
 *
 * @example
 * ```ts
 * const [showBanner, newCheckout] = await evaluate([showBannerFlag, newCheckoutFlag]);
 * const enabled = await evaluate(teamFlag, { evaluationContext: { teamId: 'team-1' } });
 * ```
 */
export const evaluate: Evaluate = ((
  flags: FlagDefinition | readonly FlagDefinition[],
  options?: { evaluationContext?: unknown },
) => runtime.evaluate(flags as FlagDefinition, options as never)) as Evaluate;

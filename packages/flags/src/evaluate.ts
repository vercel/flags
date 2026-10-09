import type { Connection, Platform } from './connection';
import { type FlagDefinition, runtime } from './runtime';
import type { EvaluationContext, Provider } from './types';

type UnionToIntersection<U> = (
  U extends unknown
    ? (value: U) => void
    : never
) extends (value: infer I) => void
  ? I
  : never;

/**
 * The shape of the evaluation context of a flag. It comes from the return
 * type of `getEvaluationContext` of the connection of the flag.
 */
export type FlagContext<F extends FlagDefinition> = F extends unknown
  ? F['connection'] extends Connection<Provider, Platform, infer C>
    ? C
    : EvaluationContext
  : never;

/**
 * The explicit context which `evaluate` accepts for a list of flags.
 *
 * The SDK merges the same object into the context of each flag. Thus, it must
 * be valid for each of their connections: it is the overlap (intersection) of
 * their contexts, and each field is optional.
 */
export type EvaluateContext<F extends readonly FlagDefinition[]> = Partial<
  UnionToIntersection<FlagContext<F[number]>>
>;

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
    context?: EvaluateContext<[F]>,
  ): Promise<boolean>;
  /**
   * Evaluates several flags. Returns their values in the order of `flags`.
   */
  <const F extends readonly FlagDefinition[]>(
    flags: F,
    context?: EvaluateContext<F>,
  ): Promise<EvaluateResults<F>>;
}

/**
 * Evaluates one flag or several flags.
 *
 * Inside `runtime.onInvoke`, each flag uses the evaluation context of its
 * connection for the current request. Outside, the context is empty.
 *
 * `context` is optional. The SDK merges its fields over the context of each
 * flag: a field in `context` replaces the same field, and all other fields
 * stay. Fields which are `undefined` are ignored. Its type comes from the
 * connections of the flags.
 *
 * Each flag which fails returns its `defaultValue`, after logging the error.
 * If a flag without `defaultValue` fails, the call rejects with its
 * `FlagEvaluationError`.
 *
 * @example
 * ```ts
 * const [showBanner, newCheckout] = await evaluate([showBannerFlag, newCheckoutFlag]);
 * const enabled = await evaluate(myFlag, { user: { id: 'user-1' } });
 * ```
 */
export const evaluate: Evaluate = ((
  flags: FlagDefinition | readonly FlagDefinition[],
  context?: EvaluationContext,
) => runtime.evaluate(flags as FlagDefinition, context)) as Evaluate;

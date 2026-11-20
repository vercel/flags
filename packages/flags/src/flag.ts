import { type DecideSource, getDecideSource } from './decide';
import { logger } from './logger';
import { type FlagDefinition, runtime } from './runtime';
import { sharedState } from './shared-state';
import { isSource, type Source, type SourceInput } from './source';
import type { FlagsRequest, Hook, HookHints } from './types';
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
   * goes to `getEvaluationContext` of the flag, or of the source if the
   * flag has none.
   */
  evaluationContext: In;
  /**
   * OpenFeature hooks for this evaluation only. They run after the hooks of
   * the configuration and of the source, and before the hooks of the
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
  C extends Source,
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
   * The values which the flag can have, e.g. for Flags Explorer and
   * precompute. A value or `{ value, label }`. The editor suggests them, but
   * the provider can also return other values of the type, e.g. a variant
   * which was added after the deployment.
   */
  readonly options?: O;
  /**
   * What the flag is for, e.g. for Flags Explorer.
   */
  readonly description?: string;
  /**
   * A source returned by `defineSource`, e.g. of `flags/sources/self`.
   */
  readonly source: C;
  /**
   * The middle step of the chain. Receives the current request and the
   * evaluation context of the call side, and returns the context for the
   * source. The type of `context`
   * defines what the call side must give.
   *
   * Without it, the call side gives its context directly to the source.
   *
   * @example
   * ```ts
   * getEvaluationContext: (_request, context: { teamId: string }) => ({
   *   teamId: context.teamId,
   * }),
   * ```
   */
  getEvaluationContext?(
    request: FlagsRequest | undefined,
    context: In,
  ): SourceInput<C> | Promise<SourceInput<C>>;
}

/**
 * The options of an inline flag: a flag which decides its value in the code,
 * with `decide`, without a provider.
 */
export interface InlineFlagOptions<
  K extends string,
  In,
  T extends FlagType,
  O extends FlagOptionsOf<T>,
> {
  readonly key: K;
  /**
   * Decides the value of the flag. Receives the current request, or
   * `undefined` outside of a request, and the evaluation context of the
   * call side.
   * The type of `context` defines what the call side must give.
   *
   * @example
   * ```ts
   * decide: (request) =>
   *   request?.cookies?.get('beta')?.value === '1',
   * ```
   */
  decide(
    request: FlagsRequest | undefined,
    context: In,
  ): NoInfer<FlagValueFrom<T, O>> | Promise<NoInfer<FlagValueFrom<T, O>>>;
  /**
   * The type of the value. The default is `boolean`. Each other type must be
   * set here.
   */
  readonly type?: T;
  /**
   * Returned when `decide` fails, after logging the error. If not set, the
   * error is thrown.
   */
  readonly defaultValue?: NoInfer<FlagValueFrom<T, O>>;
  /**
   * The values which the flag can have, e.g. for Flags Explorer and
   * precompute. A value or `{ value, label }`.
   */
  readonly options?: O;
  /**
   * What the flag is for, e.g. for Flags Explorer.
   */
  readonly description?: string;
}

export type Flag<
  C extends Source = Source,
  K extends string = string,
  In = SourceInput<C>,
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
  readonly source: C;
  getEvaluationContext?(
    request: FlagsRequest | undefined,
    context: In,
  ): SourceInput<C> | Promise<SourceInput<C>>;
};

/**
 * Declares an inline flag, which decides its value in the code with
 * `decide`. Call the returned function to evaluate it. For a flag of a
 * provider, use `bindFlag`.
 *
 * @example
 * ```ts
 * const myFlag = defineFlag({
 *   key: 'my-flag',
 *   decide: () => false,
 *   options: [false, true] as const, // optional
 * });
 * await myFlag();
 * ```
 */
export function defineFlag<
  const K extends string,
  const T extends FlagType = 'boolean',
  const O extends FlagOptionsOf<T> = FlagOptionsOf<T>,
  In = undefined,
>(
  options: InlineFlagOptions<K, In, T, O>,
): Flag<DecideSource, K, In, FlagValueFrom<T, O>> {
  const checked = checkOptions('defineFlag', options);
  if (checked.decide === undefined) {
    throw new TypeError(
      `flags: Flag "${String(checked.key)}" has no decide. Use bindFlag for the flag of a source.`,
    );
  }
  return defineFromOptions(checked) as unknown as Flag<
    DecideSource,
    K,
    In,
    FlagValueFrom<T, O>
  >;
}

/**
 * Declares a flag of a source: the provider of the source decides its
 * value. Call the returned function to evaluate it. For an inline flag,
 * use `defineFlag`.
 *
 * @example
 * ```ts
 * export const enableDashboard = bindFlag({
 *   key: 'enable-dashboard',
 *   source,
 *   options: [false, true] as const, // optional
 * });
 * await enableDashboard();
 * await enableDashboard({ evaluationContext: { teamId: 'team-1' } });
 * ```
 */
export function bindFlag<
  const K extends string,
  const T extends FlagType = 'boolean',
  const O extends FlagOptionsOf<T> = FlagOptionsOf<T>,
  C extends Source = Source,
  In = SourceInput<C>,
>(options: FlagOptions<C, K, In, T, O>): Flag<C, K, In, FlagValueFrom<T, O>> {
  const checked = checkOptions('bindFlag', options);
  if (checked.decide !== undefined) {
    throw new TypeError(
      `flags: Flag "${String(checked.key)}" has decide. Use defineFlag for inline flags.`,
    );
  }
  if (checked.source === undefined) {
    throw new TypeError(
      `flags: Flag "${String(checked.key)}" has no source. Pass the source of its provider, e.g. of flags/sources/self.`,
    );
  }
  return defineFromOptions(checked) as unknown as Flag<
    C,
    K,
    In,
    FlagValueFrom<T, O>
  >;
}

type AnyFlagOptions = Omit<
  FlagOptions<Source, string, unknown, FlagType, never>,
  'source'
> & {
  readonly source?: Source;
  readonly decide?: unknown;
};

function checkOptions(name: string, options: unknown): AnyFlagOptions {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError(`flags: ${name} expects options.`);
  }
  // An object with a provider and a project looks like a source, but
  // defineSource did not return it
  if ('provider' in options && 'project' in options && !('key' in options)) {
    throw new Error(
      'flags: The source of a flag must be returned by defineSource.',
    );
  }
  return options as AnyFlagOptions;
}

function defineFromOptions(
  options: AnyFlagOptions,
): Flag<Source, string, unknown, FlagValue> {
  const { key, defaultValue, getEvaluationContext, decide } = options;
  if (typeof key !== 'string') {
    throw new TypeError('flags: The key of a flag must be a string.');
  }
  if (decide !== undefined && typeof decide !== 'function') {
    throw new TypeError(
      `flags: The decide of flag "${key}" must be a function.`,
    );
  }
  if (decide && options.source !== undefined) {
    throw new TypeError(
      `flags: Flag "${key}" has decide and a source. An inline flag has no source.`,
    );
  }
  // An inline flag uses the internal source of inline flags
  const explicit = decide ? getDecideSource() : options.source;
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
  if (explicit !== undefined && !isSource(explicit)) {
    throw new Error(
      `flags: The source of flag "${key}" must be returned by defineSource.`,
    );
  }
  const flagOptions = normalizeOptions(key, type, options.options);
  warnAboutValues(key, type, options.type, defaultValue, flagOptions);

  if (explicit) {
    runtime.registerSource(explicit);
  }

  // The flag gives itself to the runtime, so that flag() and evaluate(flag)
  // share the cache of the request
  const flag: Flag<Source, string, unknown, FlagValue> =
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
        // Not enumerable, so that the manifest and tools see the same fields
        // as for the flags of a provider
        decide: { value: decide },
        source: {
          get: () => explicit,
          enumerable: true,
        },
      },
    ) as unknown as Flag<Source, string, unknown, FlagValue>;
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

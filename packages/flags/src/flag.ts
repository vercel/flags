import type { ConfiguredSource } from './config';
import { type DecideSource, getDecideSource } from './decide';
import { logger } from './logger';
import { type FlagDefinition, runtime } from './runtime';
import { sharedState } from './shared-state';
import { isSource, type Source, type SourceInput } from './source';
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
   * A source returned by `defineSource`. Without it, the flag uses
   * the default source.
   */
  readonly source?: C;
  /**
   * @deprecated Use `source`. Connections are now sources.
   */
  readonly connection?: C;
  /**
   * The middle step of the chain. Receives the evaluation context of the call
   * side, and returns the context for the source. The type of `context`
   * defines what the call side must give.
   *
   * Without it, the call side gives its context directly to the source.
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
   * Decides the value of the flag. Receives the evaluation context of the
   * call side, and the current request, or `undefined` outside of a request.
   * The type of `context` defines what the call side must give.
   *
   * @example
   * ```ts
   * decide: (_context, request) =>
   *   request?.cookies?.get('beta')?.value === '1',
   * ```
   */
  decide(
    context: In,
    request: FlagsRequest | undefined,
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
  /**
   * @deprecated Use `source`. Connections are now sources.
   */
  readonly connection: C;
  getEvaluationContext?(
    context: In,
    request: FlagsRequest | undefined,
  ): SourceInput<C> | Promise<SourceInput<C>>;
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
): Flag<DecideSource, K, In, FlagValueFrom<T, O>>;
/**
 * Declares a flag of a source.
 *
 * @deprecated Use `bindFlag` for the flags of a source, and `defineFlag`
 * with `decide` for inline flags.
 */
export function defineFlag<
  const K extends string,
  const T extends FlagType = 'boolean',
  const O extends FlagOptionsOf<T> = FlagOptionsOf<T>,
  C extends Source = ConfiguredSource,
  In = SourceInput<C>,
>(options: FlagOptions<C, K, In, T, O>): Flag<C, K, In, FlagValueFrom<T, O>>;
/**
 * Declares a boolean flag with a key. Short for `defineFlag({ key })`.
 *
 * @example
 * ```ts
 * const summerSale = defineFlag('summer-sale');
 * ```
 *
 * @deprecated Use `bindFlag({ key, source, type, defaultValue })`.
 */
export function defineFlag<const K extends string>(
  key: K,
): Flag<ConfiguredSource, K, SourceInput<ConfiguredSource>, boolean>;
/**
 * Declares a flag with a key and a default value. The type of the flag comes
 * from the default value. Short for `defineFlag({ key, type, defaultValue })`.
 *
 * @example
 * ```ts
 * const bannerText = defineFlag('banner-text', 'Welcome'); // string
 * ```
 *
 * @deprecated Use `bindFlag({ key, source, type, defaultValue })`.
 */
export function defineFlag<const K extends string, D extends FlagValue>(
  key: K,
  defaultValue: D,
): Flag<ConfiguredSource, K, SourceInput<ConfiguredSource>, ValueTypeOf<D>>;
/**
 * Declares a boolean flag of a source. Short for
 * `defineFlag({ key, source })`.
 *
 * @example
 * ```ts
 * const summerSale = defineFlag(launchdarkly, 'summer-sale');
 * ```
 *
 * @deprecated Use `bindFlag({ key, source, type, defaultValue })`.
 */
export function defineFlag<C extends Source, const K extends string>(
  source: C,
  key: K,
): Flag<C, K, SourceInput<C>, boolean>;
/**
 * Declares a flag of a source, with a default value. The type of the flag
 * comes from the default value. Short for
 * `defineFlag({ key, type, defaultValue, source })`.
 *
 * @example
 * ```ts
 * const maxItems = defineFlag(launchdarkly, 'max-items', 10); // number
 * ```
 *
 * @deprecated Use `bindFlag({ key, source, type, defaultValue })`.
 */
export function defineFlag<
  C extends Source,
  const K extends string,
  D extends FlagValue,
>(
  source: C,
  key: K,
  defaultValue: D,
): Flag<C, K, SourceInput<C>, ValueTypeOf<D>>;
export function defineFlag(...args: unknown[]): unknown {
  return defineFromOptions(toOptions(args));
}

/**
 * Declares a flag of a source: the provider of the source decides its
 * value. Call the returned function to evaluate it. Without a source, the
 * flag uses the default source. For an inline flag, use `defineFlag`.
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
  C extends Source = ConfiguredSource,
  In = SourceInput<C>,
>(options: FlagOptions<C, K, In, T, O>): Flag<C, K, In, FlagValueFrom<T, O>> {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('flags: bindFlag expects options.');
  }
  if ('decide' in options) {
    throw new TypeError(
      `flags: Flag "${String(options.key)}" has decide. Use defineFlag for inline flags.`,
    );
  }
  return defineFromOptions(toOptions([options])) as unknown as Flag<
    C,
    K,
    In,
    FlagValueFrom<T, O>
  >;
}

type AnyFlagOptions = FlagOptions<Source, string, unknown, FlagType, never> & {
  readonly decide?: unknown;
};

/**
 * Converts the arguments of a short form into the options of the full form.
 */
function toOptions(args: unknown[]): AnyFlagOptions {
  const [first, second, third] = args;
  if (typeof first === 'string') {
    return withDefault({ key: first }, second, args.length > 1);
  }
  if (isSource(first)) {
    if (typeof second !== 'string') {
      throw new TypeError('flags: The key of a flag must be a string.');
    }
    return withDefault({ key: second, source: first }, third, args.length > 2);
  }
  if (typeof first === 'object' && first !== null) {
    // An object with a provider and a project looks like a source, but
    // defineSource did not return it
    if ('provider' in first && 'project' in first && !('key' in first)) {
      throw new Error(
        'flags: The source of a flag must be returned by defineSource.',
      );
    }
    return first as AnyFlagOptions;
  }
  throw new TypeError(
    'flags: defineFlag expects a key, a source and a key, or options.',
  );
}

function withDefault(
  options: { key: string; source?: Source },
  defaultValue: unknown,
  hasDefault: boolean,
): FlagOptions<Source, string, unknown, FlagType, never> {
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
  if (decide && (options.source ?? options.connection) !== undefined) {
    throw new TypeError(
      `flags: Flag "${key}" has decide and a source. An inline flag has no source.`,
    );
  }
  // An inline flag uses the internal source of inline flags.
  // `connection` is the deprecated name of `source`.
  const explicit = decide
    ? getDecideSource()
    : (options.source ?? options.connection);
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

  if (explicit) runtime.registerSource(explicit);
  else runtime.markDefaultSourceUsed();

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
        // Without a source, the default source at the time of the
        // evaluation, so the configuration can come later than the flag
        source: {
          get: () => explicit ?? runtime.defaultSource,
          enumerable: true,
        },
        connection: {
          get: () => explicit ?? runtime.defaultSource,
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

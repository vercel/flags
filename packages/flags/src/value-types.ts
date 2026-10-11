import type { JsonValue } from './overrides/types';

/**
 * The type of a flag. The names are those of OpenFeature.
 */
export type FlagType = 'boolean' | 'string' | 'number' | 'object';

/**
 * The value of a flag of the type `object`: a JSON object or a JSON array.
 */
export type FlagObjectValue = { [key: string]: JsonValue } | JsonValue[];

/**
 * The value of any flag.
 */
export type FlagValue = boolean | string | number | FlagObjectValue;

/**
 * The value of a flag of the type `T`.
 */
export type FlagValueOf<T extends FlagType> = T extends 'boolean'
  ? boolean
  : T extends 'string'
    ? string
    : T extends 'number'
      ? number
      : FlagObjectValue;

/**
 * An option with a label, e.g. for Flags Explorer.
 */
export interface FlagOptionObject<V> {
  readonly value: V;
  readonly label?: string;
}

/**
 * An option of a flag: a value, or an object with a value and a label. A flag
 * of the type `object` only accepts objects with a value, because a JSON
 * object and an option object look the same.
 */
export type FlagOption<V> = V | FlagOptionObject<V>;

/**
 * The options which a flag of the type `T` accepts.
 */
export type FlagOptionsOf<T extends FlagType> = T extends 'object'
  ? readonly FlagOptionObject<FlagObjectValue>[]
  : readonly FlagOption<FlagValueOf<T>>[];

type OptionValue<O> = O extends FlagOptionObject<infer V> ? V : O;

/**
 * The value of a flag: the union of its options, if it has a fixed list of
 * options, else the value of its type.
 */
export type FlagValueFrom<
  T extends FlagType,
  O extends readonly unknown[],
> = number extends O['length'] ? FlagValueOf<T> : OptionValue<O[number]>;

const types: readonly FlagType[] = ['boolean', 'string', 'number', 'object'];

/**
 * The method of the provider for each type.
 *
 * @internal
 */
export const resolveMethodOf = {
  boolean: 'resolveBooleanEvaluation',
  string: 'resolveStringEvaluation',
  number: 'resolveNumberEvaluation',
  object: 'resolveObjectEvaluation',
} as const;

/**
 * The default which the SDK passes to the provider for a flag without
 * `defaultValue`. OpenFeature requires a default of the correct type.
 *
 * @internal
 */
export function placeholderOf(type: FlagType): FlagValue {
  switch (type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'object':
      return {};
    default:
      return false;
  }
}

/**
 * @internal
 */
export function isFlagType(value: unknown): value is FlagType {
  return types.includes(value as FlagType);
}

/**
 * Whether a value has the type of the flag.
 *
 * @internal
 */
export function hasType(value: unknown, type: FlagType): boolean {
  if (type === 'object') return typeof value === 'object' && value !== null;
  if (type === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  return typeof value === type;
}

/**
 * Converts the options of a flag into objects with a value. Throws if an
 * option of a flag of the type `object` is not an object with a value.
 *
 * @internal
 */
export function normalizeOptions(
  key: string,
  type: FlagType,
  options: readonly unknown[] | undefined,
): readonly FlagOptionObject<FlagValue>[] | undefined {
  if (options === undefined) return undefined;
  return Object.freeze(
    options.map((option) => {
      const isOptionObject =
        typeof option === 'object' &&
        option !== null &&
        !Array.isArray(option) &&
        Object.hasOwn(option, 'value');
      if (type === 'object' && !isOptionObject) {
        throw new TypeError(
          `flags: The options of flag "${key}" must be objects with a value, e.g. { value: { color: 'blue' } }, because the flag has the type object.`,
        );
      }
      return Object.freeze(
        isOptionObject
          ? { ...(option as FlagOptionObject<FlagValue>) }
          : { value: option as FlagValue },
      );
    }),
  );
}

/**
 * Whether a value is one of the options. Compares JSON values by their
 * content.
 *
 * @internal
 */
export function isOption(
  value: unknown,
  options: readonly FlagOptionObject<FlagValue>[],
): boolean {
  return options.some((option) => isEqual(option.value, value));
}

/**
 * The index of the option with this value, or -1. Compares JSON values by
 * their content. Public through `flags/tooling`.
 */
export function optionIndex(
  value: unknown,
  options: readonly FlagOptionObject<FlagValue>[],
): number {
  return options.findIndex((option) => isEqual(option.value, value));
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return (
    keysA.length === keysB.length &&
    keysA.every((key) =>
      isEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    )
  );
}

/**
 * Describes a value for an error message.
 *
 * @internal
 */
export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') return 'an object';
  if (typeof value === 'string') return `the string "${value}"`;
  return `the ${typeof value} ${String(value)}`;
}

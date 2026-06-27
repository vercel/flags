import type { JsonValue } from '..';
import * as s from '../lib/serialization';
import type { FlagOption } from '../types';

/**
 * The minimal flag shape the precompute core needs: a `key` and the optional
 * `options` used by the serializer for index-based compression. Both the Next
 * and SvelteKit `Flag` types satisfy this.
 */
export type KeyedFlag = { key: string; options?: FlagOption<any>[] };
export type FlagsArray = readonly KeyedFlag[];
export type ValuesArray = readonly any[];

/**
 * Combines flag declarations with values.
 * @param flags - flag declarations
 * @param values - flag values
 * @returns - A record where the keys are flag keys and the values are flag values.
 */
export function combine(flags: FlagsArray, values: ValuesArray) {
  return Object.fromEntries(flags.map((flag, i) => [flag.key, values[i]]));
}

/**
 * Turns a list of flags and their values into a short, signed string. Returns
 * the `__no_flags__` sentinel for an empty list. Expects an already-resolved
 * `secret`.
 */
export async function serialize(
  flags: FlagsArray,
  values: ValuesArray,
  secret: string,
): Promise<string> {
  if (flags.length === 0) return '__no_flags__';
  return s.serialize(combine(flags, values), flags, secret);
}

/**
 * Decodes a signed code back into a record of flag keys to values. Returns an
 * empty object for the `__no_flags__` sentinel. Expects an already-resolved
 * `secret`.
 */
export async function deserialize(
  flags: FlagsArray,
  code: string,
  secret: string,
): Promise<Record<string, JsonValue>> {
  if (code === '__no_flags__') return {};
  return s.deserialize(code, flags, secret);
}

/**
 * Reads a single flag's value out of a deserialized flag set, warning when the
 * flag was not part of the precomputed set.
 */
export function readFlagValue(
  flagSet: Record<string, JsonValue>,
  key: string,
): JsonValue {
  if (!Object.hasOwn(flagSet, key)) {
    console.warn(
      `flags: Tried to read precomputed value for flag "${key}" which is not part of the precomputed flags. Make sure to include it in the array passed to serialize/precompute.`,
    );
  }
  return flagSet[key];
}

/**
 * Emits the warning shown when `getPrecomputed` is called with a code generated
 * from an empty flags array.
 *
 * @param keysDescription - A human-readable description of the affected flag
 *   key(s), e.g. a single key or a comma-joined list.
 */
export function warnEmptyCode(keysDescription: string): void {
  console.warn(
    `flags: getPrecomputed was called with a code generated from an empty flags array. The flag(s) "${keysDescription}" can not be resolved. Make sure to include them in the array passed to serialize/precompute.`,
  );
}

// see https://stackoverflow.com/a/44344803
function* cartesianIterator<T>(items: T[][]): Generator<T[]> {
  const remainder = items.length > 1 ? cartesianIterator(items.slice(1)) : [[]];
  for (const r of remainder) for (const h of items.at(0)!) yield [h, ...r];
}

/**
 * Generates all permutations given a list of feature flags based on the options
 * declared on each flag. Expects an already-resolved `secret`.
 *
 * @param flags - The list of feature flags
 * @param filter - An optional filter function which gets called with each permutation.
 * @param secret - The secret to sign the generated permutations with
 * @returns An array of strings representing each permutation
 */
export async function generatePermutations(
  flags: FlagsArray,
  filter: ((permutation: Record<string, JsonValue>) => boolean) | null = null,
  secret: string,
): Promise<string[]> {
  if (flags.length === 0) return ['__no_flags__'];

  const options = flags.map((flag) => {
    // infer boolean permutations if you don't declare any options.
    //
    // to explicitly opt out you need to use "filter"
    if (!flag.options) return [false, true];
    return flag.options.map((option) => option.value);
  });

  const list: Record<string, JsonValue>[] = [];

  for (const permutation of cartesianIterator(options)) {
    const permObject = permutation.reduce<Record<string, JsonValue>>(
      (acc, value, index) => {
        acc[flags[index]!.key] = value;
        return acc;
      },
      {},
    );
    if (!filter || filter(permObject)) list.push(permObject);
  }

  return Promise.all(list.map((values) => s.serialize(values, flags, secret)));
}

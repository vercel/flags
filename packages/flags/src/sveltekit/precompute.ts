import type { JsonValue } from '..';
import * as s from '../lib/serialization';
import { cartesianIterator, combineFlags } from '../shared';
import type { Flag, FlagsArray } from './types';

type ValuesArray = readonly any[];

/**
 * Resolves a list of flags
 * @param flags - list of flags
 * @returns - an array of evaluated flag values with one entry per flag
 */
async function evaluate<T extends FlagsArray>(
  flags: T,
  request: Request,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  return Promise.all(flags.map((flag) => flag(request))) as Promise<{
    [K in keyof T]: Awaited<ReturnType<T[K]>>;
  }>;
}

/**
 * Evaluate a list of feature flags and generate a signed string representing their values.
 *
 * This convenience function call combines `evaluate` and `serialize`.
 *
 * @param flags - list of flags
 * @returns - a string representing evaluated flags
 */
export async function precompute<T extends FlagsArray>(
  flags: T,
  request: Request,
  secret: string,
): Promise<string> {
  const values = await evaluate(flags, request);
  return serialize(flags, values, secret);
}

/**
 * Takes a list of feature flag declarations and their values and turns them into a short, signed string.
 *
 * The returned string is signed to avoid enumeration attacks.
 *
 * When a feature flag's `options` contains the value the flag resolved to, then the encoding will store it's index only, leading to better compression. Boolean values and null are compressed even when the options are not declared on the flag.
 *
 * @param flags - A list of feature flags
 * @param values - A list of the values of the flags declared in ´flags`
 * @param secret - The secret to use for signing the result
 * @returns - A short string representing the values.
 */
async function serialize(
  flags: FlagsArray,
  values: ValuesArray,
  secret: string,
) {
  return s.serialize(combineFlags(flags, values), flags, secret);
}

/**
 * Generates all permutations given a list of feature flags based on the options declared on each flag.
 * @param flags - The list of feature flags
 * @param filter - An optional filter function which gets called with each permutation.
 * @param secret - The secret sign the generated permutation with
 * @returns An array of strings representing each permutation
 */
export async function generatePermutations(
  flags: FlagsArray,
  filter: ((permutation: Record<string, JsonValue>) => boolean) | null = null,
  secret: string,
): Promise<string[]> {
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
        acc[(flags[index] as Flag<unknown>).key] = value;
        return acc;
      },
      {},
    );
    if (!filter || filter(permObject)) list.push(permObject);
  }

  return Promise.all(list.map((values) => s.serialize(values, flags, secret)));
}

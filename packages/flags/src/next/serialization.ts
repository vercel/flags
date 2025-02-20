import type { JsonValue } from '..';
import { memoizeOne } from './async-memoize-one';
import type { Flag } from './types';
import type { FlagOption } from '../types';
import { CompactSign, base64url, compactVerify } from 'jose';

// 252 max options length allows storing index  0 to 251,
// so 252 is the first SPECIAL_INTEGER
export const MAX_OPTION_LENGTH = 252;

enum SPECIAL_INTEGERS {
  /** Signals that the returned value is not listed in the flag's options */
  NULL = 252,
  BOOLEAN_FALSE = 253,
  BOOLEAN_TRUE = 254,
  UNLISTED_VALUE = 255,
}

const memoizedVerify = memoizeOne(
  (code: string, secret: string) =>
    compactVerify(code, base64url.decode(secret), {
      algorithms: ['HS256'],
    }),
  (a, b) => a[0] === b[0] && a[1] === b[1], // only first two args matter
  { cachePromiseRejection: true },
);

const memoizedSign = memoizeOne(
  (uint8Array: Uint8Array, secret) =>
    new CompactSign(uint8Array)
      .setProtectedHeader({ alg: 'HS256' })
      .sign(base64url.decode(secret)),
  (a, b) =>
    // matchedIndices array must be equal
    a[0].length === b[0].length &&
    a[0].every((v, i) => b[0][i] === v) &&
    // secrets must be equal
    a[1] === b[1],
  { cachePromiseRejection: true },
);

function splitUint8Array(
  array: Uint8Array,
  index: number,
): [Uint8Array, Uint8Array] {
  const firstHalf = array.slice(0, index);
  const secondHalf = array.slice(index);
  return [firstHalf, secondHalf];
}

export async function deserialize(
  code: string,
  flags: readonly Flag<any, any>[],
  secret: string,
): Promise<Record<string, JsonValue>> {
  // TODO what happens when verification fails?
  const { payload } = await memoizedVerify(code, secret);

  const [matchedIndicesArray, valuesUint8Array] =
    payload.length === flags.length
      ? [payload]
      : splitUint8Array(payload, flags.length);

  const valuesArray = valuesUint8Array
    ? // re-add opening and closing brackets since we remove them when serializing
      JSON.parse(`[${new TextDecoder().decode(valuesUint8Array)}]`)
    : null;

  let spilled = 0;
  return matchedIndicesArray.reduce<Record<string, JsonValue>>(
    (acc, valueIndex, index) => {
      const flag = flags[index];

      if (!flag) {
        throw new Error(`flags: No flag at index ${index}`);
      }

      switch (valueIndex) {
        case SPECIAL_INTEGERS.BOOLEAN_FALSE:
          acc[flag.key] = false;
          break;
        case SPECIAL_INTEGERS.BOOLEAN_TRUE:
          acc[flag.key] = true;
          break;
        case SPECIAL_INTEGERS.UNLISTED_VALUE:
          acc[flag.key] = valuesArray[spilled++];
          break;
        case SPECIAL_INTEGERS.NULL:
          acc[flag.key] = null;
          break;
        default:
          acc[flag.key] = flag.options?.[valueIndex]?.value as JsonValue;
      }

      return acc;
    },
    {},
  );
}

/**
 * When serializing flags we find the matching option index for each evaluated value.
 *
 * This means we potentially need to iterate through all options of all flags.
 *
 * When the value we're trying to match is a literal (bool, string, number)
 * we look for it using referntial equality.
 *
 * When the value is an array or object we stringify the value and we stringify
 * the options of each flag and then we search for it by string comparison.
 *
 * This is faster than doing a deep equality check and also allows us not to
 * use any external library.
 *
 * We also cache the result of stringifying all options so in a Map so we only
 * ever need to stringify them once.
 */
const matchIndex = (function () {
  const stringifiedOptionsCache = new Map<FlagOption<any>[], string[]>();
  return function matchIndex(options: FlagOption<any>[], value: JsonValue) {
    const t = typeof value;

    // we're looking for a literal value, so we can check using referntial equality
    if (value === null || t === 'boolean' || t === 'string' || t === 'number') {
      return options.findIndex((v) => v.value === value);
    }

    // we're looking for an array or object, so we should check stringified
    const stringifiedValue = JSON.stringify(value);
    let stringifiedOptions = stringifiedOptionsCache.get(options);
    if (!stringifiedOptions) {
      stringifiedOptions = options.map((o) => JSON.stringify(o.value));
      stringifiedOptionsCache.set(options, stringifiedOptions);
    }

    return stringifiedOptions.findIndex(
      (stringifiedOption) => stringifiedOption === stringifiedValue,
    );
  };
})();

function joinUint8Arrays(array1: Uint8Array, array2: Uint8Array): Uint8Array {
  const combined = new Uint8Array(array1.length + array2.length);
  combined.set(array1);
  combined.set(array2, array1.length);
  return combined;
}
export async function serialize(
  flagSet: Record<Flag<any, any>['key'], JsonValue>,
  flags: readonly Flag<any, any>[],
  secret: string,
) {
  const unlistedValues: JsonValue[] = [];

  const matchedIndices = new Uint8Array(
    flags.map((flag) => {
      const options = Array.isArray(flag.options) ? flag.options : [];

      const value = flagSet[flag.key];
      if (
        !Object.prototype.hasOwnProperty.call(flagSet, flag.key) ||
        value === undefined
      ) {
        throw new Error(`flags: Missing value for flag "${flag.key}"`);
      }

      // avoid searching for common values
      // and ensure they can always be compressed, even if not listed in options
      switch (value) {
        case null:
          return SPECIAL_INTEGERS.NULL;
        case false:
          return SPECIAL_INTEGERS.BOOLEAN_FALSE;
        case true:
          return SPECIAL_INTEGERS.BOOLEAN_TRUE;
      }

      const matchedIndex = matchIndex(options, value);
      if (matchedIndex > -1) return matchedIndex;

      // value was not listed in options, so we need to
      // transport it using JSON.stringify(). we return 255 to
      // indicate this value is stringified.
      // stringified values will be placed at the end of the
      // indices array
      unlistedValues.push(value);
      return SPECIAL_INTEGERS.UNLISTED_VALUE;
    }),
  );

  let joined: Uint8Array;
  // there were unlisted values, so we need to join arrays
  if (unlistedValues.length > 0) {
    const jsonArray = new TextEncoder().encode(
      // slicing removes opening and closing array brackets as they'll always be
      //  there and we can re-add them when deserializing
      JSON.stringify(unlistedValues).slice(1, -1),
    );
    joined = joinUint8Arrays(matchedIndices, jsonArray);
  } else {
    joined = matchedIndices;
  }

  return memoizedSign(joined, secret);
}

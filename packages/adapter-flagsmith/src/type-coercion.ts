import type { FlagsmithValue } from '.';

export type CoerceOption = 'string' | 'boolean' | 'number';

export type CoercedType<T extends CoerceOption | undefined> = T extends 'string'
  ? string
  : T extends 'boolean'
    ? boolean
    : T extends 'number'
      ? number
      : FlagsmithValue;

/**
 * Attempts to coerce a Flagsmith value to a boolean.
 * Returns undefined if coercion is not possible.
 */
export function toBoolean(value: FlagsmithValue): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 0) return false;
    if (value === 1) return true;
    return undefined;
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return undefined;
}

/**
 * Attempts to coerce a Flagsmith value to a number.
 * Returns undefined if coercion results in NaN or invalid number.
 */
export function toNumber(value: FlagsmithValue): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' || typeof value === 'boolean') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Converts a Flagsmith value to a string.
 * Returns undefined for null, undefined, or NaN values to avoid string representations like "null", "undefined", or "NaN".
 */
export function toStringValue(value: FlagsmithValue): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' && !Number.isFinite(value)) return undefined;
  return String(value);
}

/**
 * Coerces a value to the specified type.
 * Returns undefined if coercion fails.
 */
export function coerceValue(
  value: FlagsmithValue,
  type: CoerceOption,
): string | number | boolean | undefined {
  switch (type) {
    case 'string':
      return toStringValue(value);
    case 'number':
      return toNumber(value);
    case 'boolean':
      return toBoolean(value);
    default:
      return undefined;
  }
}

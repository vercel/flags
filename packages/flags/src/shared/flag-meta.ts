import type {
  Adapter,
  Decide,
  FlagDeclaration,
  Identify,
  Origin,
  ResolvedFlagDeclaration,
} from '../types';

/**
 * Allow passing the adapter factory directly (`adapter: vercelAdapter`) as a
 * shorthand for calling it (`adapter: vercelAdapter()`). Resolves it once so
 * every consumer works with a concrete {@link Adapter} instance.
 */
export function resolveAdapter<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Adapter<ValueType, EntitiesType> | undefined {
  return typeof definition.adapter === 'function'
    ? definition.adapter()
    : definition.adapter;
}

/**
 * Builds the `decide` function for a flag, preferring an inline
 * `definition.decide` over the adapter's `decide`. Throws when neither is
 * available, or when an adapter is present but lacks a `decide` method.
 */
export function getDecide<ValueType, EntitiesType>(
  definition: ResolvedFlagDeclaration<ValueType, EntitiesType>,
): Decide<ValueType, EntitiesType> {
  if (definition.adapter && typeof definition.adapter.decide !== 'function') {
    throw new Error(
      `flags: The adapter passed to flag "${definition.key}" does not have a "decide" method.`,
    );
  }

  if (
    typeof definition.decide !== 'function' &&
    typeof definition.adapter?.decide !== 'function'
  ) {
    throw new Error(
      `flags: You passed a flag declaration that does not have a "decide" method for flag "${definition.key}"`,
    );
  }

  return function decide(params) {
    if (typeof definition.decide === 'function') {
      return definition.decide(params);
    }
    if (typeof definition.adapter?.decide === 'function') {
      return definition.adapter.decide({ key: definition.key, ...params });
    }
    throw new Error(`flags: No decide function provided for ${definition.key}`);
  };
}

/**
 * Builds the `identify` function for a flag, preferring an inline
 * `definition.identify` over the adapter's `identify`. Always returns a
 * function; when neither source provides one the function resolves to
 * `undefined` (no entities).
 */
export function getIdentify<ValueType, EntitiesType>(
  definition: ResolvedFlagDeclaration<ValueType, EntitiesType>,
): Identify<EntitiesType> {
  return function identify(params) {
    if (typeof definition.identify === 'function') {
      return definition.identify(params);
    }
    if (typeof definition.adapter?.identify === 'function') {
      return definition.adapter.identify(params);
    }
    return definition.identify;
  };
}

/**
 * Resolves the `origin` of a flag, preferring an inline `definition.origin`
 * over the adapter's `origin` (which may be a value or a `(key) => origin`
 * function).
 */
export function getOrigin<ValueType, EntitiesType>(
  definition: ResolvedFlagDeclaration<ValueType, EntitiesType>,
): string | Origin | undefined {
  if (definition.origin) return definition.origin;
  if (typeof definition.adapter?.origin === 'function')
    return definition.adapter.origin(definition.key);
  return definition.adapter?.origin;
}

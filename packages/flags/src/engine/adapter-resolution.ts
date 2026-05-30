import type { Decide, FlagDeclaration, Identify, Origin } from '../types';

/**
 * Resolves the `decide` function from a flag declaration, checking
 * the explicit declaration first, then the adapter.
 */
export function getDecide<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Decide<ValueType, EntitiesType> {
  if (definition.adapter && typeof definition.adapter.decide !== 'function') {
    throw new Error(
      `flags: You passed an adapter that does not have a "decide" method for flag "${definition.key}". Did you pass "adapter: exampleAdapter" instead of "adapter: exampleAdapter()"?`,
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
 * Resolves the `identify` function from a flag declaration, checking
 * the explicit declaration first, then the adapter.
 */
export function getIdentify<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Identify<EntitiesType> | undefined {
  if (typeof definition.identify === 'function') {
    return definition.identify;
  }
  if (typeof definition.adapter?.identify === 'function') {
    return definition.adapter.identify;
  }
}

/**
 * Resolves the `origin` from a flag declaration, checking
 * the explicit declaration first, then the adapter.
 */
export function getOrigin<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): string | Origin | undefined {
  if (definition.origin) return definition.origin;
  if (typeof definition.adapter?.origin === 'function')
    return definition.adapter.origin(definition.key);
  return definition.adapter?.origin;
}

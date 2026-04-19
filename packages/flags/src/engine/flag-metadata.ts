import { normalizeOptions } from '../lib/normalize-options';
import type { Decide, FlagDeclaration, Identify } from '../types';

/**
 * Attaches flag metadata properties to a flag function.
 * Both Next.js and SvelteKit attach the same set of properties.
 */
export function attachFlagMetadata<ValueType, EntitiesType>(
  fn: Record<string, any>,
  definition: FlagDeclaration<ValueType, EntitiesType>,
  {
    decide,
    identify,
    origin,
  }: {
    decide: Decide<ValueType, EntitiesType>;
    identify?: Identify<EntitiesType>;
    origin?: FlagDeclaration<ValueType, EntitiesType>['origin'];
  },
): void {
  fn.key = definition.key;
  fn.defaultValue = definition.defaultValue;
  fn.origin = origin;
  fn.description = definition.description;
  fn.options = normalizeOptions<ValueType>(definition.options);
  fn.decide = decide;
  fn.identify = identify;
}

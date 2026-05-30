import { normalizeOptions } from '../lib/normalize-options';
import type {
  FlagDefinitionsType,
  FlagDefinitionType,
  ProviderData,
} from '../types';
import type { FlagLike } from './types';

/**
 * Takes an object whose values are feature flag declarations and
 * turns them into ProviderData to be returned through `/.well-known/vercel/flags`.
 *
 * Works with any framework's flag shape that satisfies `FlagLike`.
 */
export function getProviderData(
  flags: Record<string, FlagLike | readonly unknown[]>,
): ProviderData {
  const definitions = Object.values(flags)
    // filter out precomputed arrays
    .filter((i): i is FlagLike => !Array.isArray(i))
    .reduce<FlagDefinitionsType>((acc, d) => {
      acc[d.key] = {
        options: normalizeOptions(d.options),
        origin: d.origin,
        description: d.description,
        defaultValue: d.defaultValue,
        declaredInCode: true,
      } satisfies FlagDefinitionType;
      return acc;
    }, {});

  return { definitions, hints: [] };
}

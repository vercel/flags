import type { FlagOption, GenerousOption } from '../types';

export function normalizeOptions<T>(
  flagOptions: GenerousOption<T>[] | undefined,
): FlagOption<T>[] | undefined {
  if (!Array.isArray(flagOptions)) return flagOptions;

  return flagOptions.map((option) => {
    if (typeof option === 'boolean') return { value: option };
    if (typeof option === 'number') return { value: option };
    if (typeof option === 'string') return { value: option };
    if (option === null) return { value: option };

    return option;
  }) as FlagOption<T>[];
}

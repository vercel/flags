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

export function getOptionLabel(
  options: FlagOption<unknown>[] | undefined,
  value: unknown,
): string | undefined {
  if (
    !Array.isArray(options) ||
    (value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean')
  ) {
    return undefined;
  }

  let match: FlagOption<unknown> | undefined;
  for (const option of options ?? []) {
    if (option.value === value) {
      if (match) {
        return undefined;
      }
      match = option;
    }
  }
  return match?.label || undefined;
}

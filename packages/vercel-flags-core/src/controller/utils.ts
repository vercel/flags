/**
 * Parses a configUpdatedAt value (number or string) into a numeric timestamp.
 * Returns undefined if the value is missing or cannot be parsed.
 */
export function parseConfigUpdatedAt(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

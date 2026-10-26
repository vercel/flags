const NAMESPACE = '@vercel/flags-core';

let lastValue: string | undefined;
let lastEnabled = false;

/** Matches one `DEBUG` pattern, where `*` stands for any sequence of characters. */
function matches(pattern: string, namespace: string): boolean {
  if (!pattern.includes('*')) {
    return pattern === namespace;
  }
  const expression = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${expression}$`).test(namespace);
}

/**
 * Whether `DEBUG` selects the `@vercel/flags-core` namespace, following the
 * `debug` package conventions: patterns are separated by commas or spaces,
 * `*` is a wildcard, and a leading `-` excludes a pattern.
 *
 * The variable is read on every call so toggling it at runtime takes effect,
 * but the parse is cached by raw value to keep disabled calls cheap.
 */
export function isDebugEnabled(): boolean {
  const value = process.env.DEBUG;
  if (value === lastValue) {
    return lastEnabled;
  }

  let enabled = false;
  if (value) {
    for (const entry of value.split(/[\s,]+/)) {
      if (!entry) {
        continue;
      }
      if (entry.startsWith('-')) {
        if (matches(entry.slice(1), NAMESPACE)) {
          enabled = false;
          break;
        }
      } else if (matches(entry, NAMESPACE)) {
        enabled = true;
      }
    }
  }

  lastValue = value;
  lastEnabled = enabled;
  return enabled;
}

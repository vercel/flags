// A stand-in for TanStack Router in the tests, with the checks of
// @tanstack/router-core.
export function isRedirect(value: unknown): boolean {
  return value instanceof Response && 'options' in value;
}

export function isNotFound(value: unknown): boolean {
  return (value as { isNotFound?: unknown } | null)?.isNotFound === true;
}

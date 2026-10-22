import type { HttpError, Redirect } from '@sveltejs/kit';

function hasStatusInRange(
  error: object,
  min: number,
  max: number,
): error is { status: number } {
  return (
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= min &&
    error.status <= max
  );
}

function isRedirectShape(error: object): error is Redirect {
  return (
    hasStatusInRange(error, 300, 308) &&
    'location' in error &&
    typeof error.location === 'string'
  );
}

function isHttpErrorShape(error: object): error is HttpError {
  if (!hasStatusInRange(error, 400, 599) || !('body' in error)) {
    return false;
  }
  const body = error.body;
  return (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string'
  );
}

/**
 * Whether `error` was thrown by `redirect()` or `error()` from `@sveltejs/kit`.
 *
 * Matches the public `Redirect` / `HttpError` shapes instead of using
 * `isRedirect` / `isHttpError`, which are `instanceof` checks against this
 * package's copy of `@sveltejs/kit` and miss instances thrown by the app's
 * copy when the two resolve to different module instances.
 */
export function isSvelteKitControlFlow(
  error: unknown,
): error is Redirect | HttpError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  return isRedirectShape(error) || isHttpErrorShape(error);
}

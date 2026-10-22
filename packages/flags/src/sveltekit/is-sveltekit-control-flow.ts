import {
  type HttpError,
  isHttpError,
  isRedirect,
  type Redirect,
} from '@sveltejs/kit';

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
  return (
    hasStatusInRange(error, 400, 599) &&
    'body' in error &&
    typeof error.body === 'object' &&
    error.body !== null
  );
}

function constructorName(error: object): string | undefined {
  const name = error.constructor?.name;
  if (typeof name !== 'string') {
    return undefined;
  }
  return name;
}

/**
 * Whether `error` was thrown by `redirect()` or `error()` from `@sveltejs/kit`.
 *
 * `isRedirect` and `isHttpError` are `instanceof` checks against this package's
 * copy of `@sveltejs/kit`. A second copy misses them, including when a build
 * keeps the class name. A shape-only check would also match a plain object or
 * an `Error` that happens to have the same fields. SvelteKit itself only
 * treats the classes as control flow, so those stay span errors.
 */
export function isSvelteKitControlFlow(
  error: unknown,
): error is Redirect | HttpError {
  if (isRedirect(error) || isHttpError(error)) {
    return true;
  }
  if (typeof error !== 'object' || error === null || error instanceof Error) {
    return false;
  }
  const name = constructorName(error);
  if (name === 'Redirect') {
    return isRedirectShape(error);
  }
  if (name === 'HttpError') {
    return isHttpErrorShape(error);
  }
  return false;
}

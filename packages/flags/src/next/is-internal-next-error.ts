// This is a temporary workaround until the appropriate mechanism is added to
// Next.js to detect an error that should not be caught. This symbol is defined
// in React, but is not exported, so we have to define it here.
//
// See: https://github.com/facebook/react/blob/493610f299ddf7d06e147e60dc4f2b97482982d2/packages/shared/ReactSymbols.js#L52
//
const REACT_POSTPONE_TYPE: symbol = Symbol.for('react.postpone');

function isPostpone(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$$typeof' in error &&
    error.$$typeof === REACT_POSTPONE_TYPE
  );
}

/**
 * Determines if an error is an error that Next/React uses internally to signal
 * a particular behavior, and not an error that should be caught by user-code.
 * This is a stop-gap until a better solution like `unstable_rethrow` lands.
 * This is a brittle solution and should be removed as soon as a better solution becomes available,
 * as it relies on internal implementation details of Next.js.
 * Context: https://github.com/vercel/next.js/discussions/64076
 * @param error - The error to check
 * @returns True if the error is an error that shouldn't be treated as an error.
 */
export function isInternalNextError(error: unknown): boolean {
  if (isPostpone(error)) return true;

  // Next.js internal errors attach a special message to the `digest` property.
  if (
    typeof error !== 'object' ||
    error === null ||
    !('digest' in error) ||
    typeof error.digest !== 'string'
  ) {
    return false;
  }

  // Redirect errors contain additional information delimited by a semicolon
  // We only care about the error code, which is the first part of the digest
  const errorCode = error.digest.split(';')[0];

  return (
    errorCode === 'NEXT_REDIRECT' ||
    errorCode === 'DYNAMIC_SERVER_USAGE' ||
    errorCode === 'BAILOUT_TO_CLIENT_SIDE_RENDERING' ||
    errorCode === 'NEXT_NOT_FOUND'
  );
}

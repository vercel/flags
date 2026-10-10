/**
 * Thrown when a flag can not be evaluated and has no `defaultValue`.
 */
export class FlagEvaluationError extends Error {
  readonly flagKey: string;
  /**
   * An OpenFeature error code, e.g. `FLAG_NOT_FOUND`.
   */
  readonly code: string;

  constructor(
    flagKey: string,
    code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`flags: Could not evaluate flag "${flagKey}": ${message}`, options);
    this.name = 'FlagEvaluationError';
    this.flagKey = flagKey;
    this.code = code;
  }
}

/**
 * @internal
 */
export function toEvaluationError(
  flagKey: string,
  error: unknown,
): FlagEvaluationError {
  if (error instanceof FlagEvaluationError) return error;
  const code =
    error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'GENERAL';
  const message = (error instanceof Error ? error.message : String(error))
    // The message of the SDK has its own prefix
    .replace(/^flags: /, '');
  return new FlagEvaluationError(flagKey, code, message, { cause: error });
}

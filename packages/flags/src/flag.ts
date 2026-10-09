import { isProject, type ProjectProvider } from './project';
import { initializeProvider, registerProvider } from './providers';
import type { FlagKey, Logger } from './types';

const logger: Logger = console;

export interface FlagOptions<P extends ProjectProvider, K extends string> {
  key: K;
  /**
   * Returned when the evaluation fails, after logging the error. If not set,
   * the error is thrown.
   */
  defaultValue?: boolean;
  /**
   * A provider returned by `defineProject`.
   */
  provider: P;
}

export type Flag<
  P extends ProjectProvider = ProjectProvider,
  K extends string = string,
> = (() => Promise<boolean>) & {
  readonly key: K;
  readonly defaultValue?: boolean;
  readonly provider: P;
};

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

function toEvaluationError(flagKey: string, error: unknown) {
  if (error instanceof FlagEvaluationError) return error;
  const code =
    error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'GENERAL';
  const message = error instanceof Error ? error.message : String(error);
  return new FlagEvaluationError(flagKey, code, message, { cause: error });
}

/**
 * Declares a flag. Call the returned function to evaluate it.
 */
export function defineFlag<
  P extends ProjectProvider,
  const K extends FlagKey<P>,
>(options: FlagOptions<P, K>): Flag<P, K> {
  const { key, defaultValue, provider } = options;

  if (!isProject(provider)) {
    throw new Error(
      `flags: The provider of flag "${key}" must be returned by defineProject.`,
    );
  }

  registerProvider(provider);

  async function evaluate(): Promise<boolean> {
    try {
      await initializeProvider(provider);
      const details = await provider.resolveBooleanEvaluation(
        key,
        // OpenFeature requires a default. Without one, errors are thrown, so
        // this placeholder is never returned.
        defaultValue ?? false,
        {},
        logger,
      );

      if (details.errorCode) {
        throw new FlagEvaluationError(
          key,
          details.errorCode,
          details.errorMessage ?? details.errorCode,
        );
      }
      if (typeof details.value !== 'boolean') {
        throw new FlagEvaluationError(
          key,
          'TYPE_MISMATCH',
          `Expected a boolean, got ${typeof details.value}`,
        );
      }
      return details.value;
    } catch (error) {
      const evaluationError = toEvaluationError(key, error);
      if (defaultValue === undefined) throw evaluationError;
      logger.error(evaluationError);
      return defaultValue;
    }
  }

  return Object.assign(evaluate, { key, defaultValue, provider });
}

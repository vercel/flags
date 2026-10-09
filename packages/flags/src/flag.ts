import { type Connection, isConnection } from './connection';
import { initializeProvider, registerConnection } from './registry';
import type { FlagKey, Logger } from './types';

const logger: Logger = console;

export interface FlagOptions<C extends Connection, K extends string> {
  key: K;
  /**
   * Returned when the evaluation fails, after logging the error. If not set,
   * the error is thrown.
   */
  defaultValue?: boolean;
  /**
   * A connection returned by `defineConnection`.
   */
  connection: C;
}

export type Flag<
  C extends Connection = Connection,
  K extends string = string,
> = (() => Promise<boolean>) & {
  readonly key: K;
  readonly defaultValue?: boolean;
  readonly connection: C;
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
  C extends Connection,
  const K extends FlagKey<C['provider']>,
>(options: FlagOptions<C, K>): Flag<C, K> {
  const { key, defaultValue, connection } = options;

  if (!isConnection(connection)) {
    throw new Error(
      `flags: The connection of flag "${key}" must be returned by defineConnection.`,
    );
  }

  registerConnection(connection);
  const { provider } = connection;

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

  return Object.assign(evaluate, { key, defaultValue, connection });
}

import type { Logger, LoggerProvider } from '@opentelemetry/api-logs';
import { AsyncLocalStorage } from 'async_hooks';
import { name as pkgName, version } from '../../package.json';
import type { FlagOption } from '../types';
import { getOptionLabel } from './normalize-options';

const loggerSymbol = Symbol.for('flags:global-logger');
const eventName = 'feature_flag.evaluation';

const evaluationContext = new AsyncLocalStorage<{ failed: boolean }>();

/** Registers an OpenTelemetry logger for feature flag evaluation events. */
export function setLoggerProvider(provider: LoggerProvider): void {
  Reflect.set(globalThis, loggerSymbol, provider.getLogger(pkgName, version));
}

function getLogger(): Logger | undefined {
  return Reflect.get(globalThis, loggerSymbol) as Logger | undefined;
}

/**
 * Marks the current evaluation as failed even though it resolves, e.g. when a
 * flag falls back to its `defaultValue` after an error.
 */
export function setEvaluationError(): void {
  const store = evaluationContext.getStore();
  if (store) {
    store.failed = true;
  }
}

function emitFlagEvaluation(
  key: string,
  options: FlagOption<unknown>[] | undefined,
  value: unknown,
  failed: boolean,
): void {
  const logger = getLogger();
  if (!logger) {
    return;
  }

  try {
    const attributes: Record<string, string> = { 'feature_flag.key': key };
    const label = getOptionLabel(options, value);
    if (label) {
      attributes['feature_flag.result.variant'] = label;
    }
    if (failed) {
      attributes['error.type'] = 'general';
      attributes['feature_flag.result.reason'] = 'error';
    }
    logger.emit({ eventName, attributes });
  } catch {
    // Telemetry must not change flag results.
  }
}

function emitFlagEvaluationError(
  key: string,
  error: unknown,
  isIgnoredError: (error: unknown) => boolean,
): void {
  const logger = getLogger();
  if (!logger) {
    return;
  }

  let ignored = false;
  try {
    ignored = isIgnoredError(error);
  } catch {
    // A failing classifier does not change the evaluation error.
  }
  if (ignored) {
    return;
  }

  try {
    logger.emit({
      eventName,
      attributes: { 'feature_flag.key': key, 'error.type': 'general' },
    });
  } catch {
    // Telemetry must not change flag results.
  }
}

export function logEvaluation<T>(
  key: string,
  options: FlagOption<unknown>[] | undefined,
  isIgnoredError: (error: unknown) => boolean,
  evaluate: () => Promise<T>,
): Promise<T> {
  if (!getLogger()) {
    return evaluate();
  }

  const store = { failed: false };
  return evaluationContext.run(store, evaluate).then(
    (value) => {
      emitFlagEvaluation(key, options, value, store.failed);
      return value;
    },
    (error) => {
      emitFlagEvaluationError(key, error, isIgnoredError);
      throw error;
    },
  );
}

export function logFlagEvaluation<F extends (...args: any[]) => Promise<any>>(
  fn: F,
  key: string,
  options: FlagOption<unknown>[] | undefined,
  isIgnoredError: (error: unknown) => boolean,
): F {
  return function (this: unknown, ...args: Parameters<F>) {
    return logEvaluation(key, options, isIgnoredError, () =>
      fn.apply(this, args),
    );
  } as F;
}

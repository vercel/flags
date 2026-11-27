import type { Logger, LoggerProvider } from '@opentelemetry/api-logs';
import { name as pkgName, version } from '../../package.json';
import type { FlagOption } from '../types';
import { getOptionLabel } from './normalize-options';

const loggerSymbol = Symbol.for('flags:global-logger');
const eventName = 'feature_flag.evaluation';

/** Registers an OpenTelemetry logger for feature flag evaluation events. */
export function setLoggerProvider(provider: LoggerProvider): void {
  Reflect.set(globalThis, loggerSymbol, provider.getLogger(pkgName, version));
}

function getLogger(): Logger | undefined {
  return Reflect.get(globalThis, loggerSymbol) as Logger | undefined;
}

export function emitFlagEvaluation(
  key: string,
  options: FlagOption<unknown>[] | undefined,
  value: unknown,
): void {
  const logger = getLogger();
  if (!logger) {
    return;
  }

  try {
    const label = getOptionLabel(options, value);
    const attributes = label
      ? { 'feature_flag.key': key, 'feature_flag.result.variant': label }
      : { 'feature_flag.key': key };
    logger.emit({ eventName, attributes });
  } catch {
    // Telemetry must not change flag results.
  }
}

export function emitFlagEvaluationError(
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

export function logFlagEvaluation<F extends (...args: any[]) => Promise<any>>(
  fn: F,
  key: string,
  options: FlagOption<unknown>[] | undefined,
  isIgnoredError: (error: unknown) => boolean,
): F {
  return function (this: unknown, ...args: Parameters<F>) {
    const result = fn.apply(this, args);
    if (!getLogger()) {
      return result;
    }
    return result.then(
      (value) => {
        emitFlagEvaluation(key, options, value);
        return value;
      },
      (error) => {
        emitFlagEvaluationError(key, error, isIgnoredError);
        throw error;
      },
    );
  } as F;
}

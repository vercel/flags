import type { Logger } from './types';

/**
 * The logger used by the SDK and passed to providers. Like the default logger
 * of OpenFeature, it writes errors and warnings to the console, and ignores
 * info and debug messages.
 *
 * @internal
 */
export const logger: Logger = {
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  info: () => {},
  debug: () => {},
};

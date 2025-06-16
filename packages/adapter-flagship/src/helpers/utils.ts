import { LogLevel, type IFlagshipConfig } from '@flagship.io/js-sdk';

export function logError(
  config: IFlagshipConfig,
  message: string,
  tag: string,
): void {
  if (!config.logLevel || config.logLevel < LogLevel.ERROR) {
    return;
  }

  if (typeof config.onLog === 'function') {
    config.onLog(LogLevel.ERROR, tag, message);
  }

  if (config.logManager && typeof config.logManager.error === 'function') {
    config.logManager.error(message, tag);
  }
}

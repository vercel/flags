import { describe, it, expect, vi } from 'vitest';
import type { IFlagshipConfig, IFlagshipLogManager } from '@flagship.io/js-sdk';
import { LogLevel } from '@flagship.io/js-sdk';
import { logError } from './utils';

describe('logError', () => {
  const message = 'Test error message';
  const tag = 'TestTag';

  it('should not log if logLevel is undefined', () => {
    const config = { logLevel: undefined } as IFlagshipConfig;
    const onLog = vi.fn();
    const logManager = { error: vi.fn() } as unknown as IFlagshipLogManager;
    config.onLog = onLog;
    config.logManager = logManager;

    logError(config, message, tag);

    expect(onLog).not.toHaveBeenCalled();
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(logManager.error).not.toHaveBeenCalled();
  });

  it('should not log if logLevel is more than ERROR', () => {
    const config = { logLevel: LogLevel.CRITICAL } as IFlagshipConfig;
    const onLog = vi.fn();
    const logManager = { error: vi.fn() } as unknown as IFlagshipLogManager;
    config.onLog = onLog;
    config.logManager = logManager;

    logError(config, message, tag);

    expect(onLog).not.toHaveBeenCalled();
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(logManager.error).not.toHaveBeenCalled();
  });

  it('should call onLog if provided and logLevel is ERROR', () => {
    const onLog = vi.fn();
    const config = {
      logLevel: LogLevel.ERROR,
      onLog,
    } as IFlagshipConfig;

    logError(config, message, tag);

    expect(onLog).toHaveBeenCalledWith(LogLevel.ERROR, tag, message);
  });

  it('should call onLog if provided and logLevel is higher than ERROR', () => {
    const onLog = vi.fn();
    const config = {
      logLevel: LogLevel.ALL,
      onLog,
    } as IFlagshipConfig;

    logError(config, message, tag);

    expect(onLog).toHaveBeenCalledWith(LogLevel.ERROR, tag, message);
  });

  it('should call logManager.error if provided and logLevel is ERROR', () => {
    const logManager = { error: vi.fn() } as unknown as IFlagshipLogManager;
    const config = {
      logLevel: LogLevel.ERROR,
      logManager,
    } as IFlagshipConfig;

    logError(config, message, tag);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(logManager.error).toHaveBeenCalledWith(message, tag);
  });

  it('should call both onLog and logManager.error if both are provided', () => {
    const onLog = vi.fn();
    const logManager = { error: vi.fn() } as unknown as IFlagshipLogManager;
    const config = {
      logLevel: LogLevel.ERROR,
      onLog,
      logManager,
    } as IFlagshipConfig;

    logError(config, message, tag);

    expect(onLog).toHaveBeenCalledWith(LogLevel.ERROR, tag, message);
    // eslint-disable-next-line jest/unbound-method -- This is a mocked method in tests, so there's no risk of 'this' binding issues
    expect(logManager.error).toHaveBeenCalledWith(message, tag);
  });

  it('should not throw if onLog is not a function', () => {
    const config = {
      logLevel: LogLevel.ERROR,
      onLog: 'notAFunction' as unknown as (
        level: LogLevel,
        tag: string,
        message: string,
      ) => void,
    } as IFlagshipConfig;

    expect(() => logError(config, message, tag)).not.toThrow();
  });

  it('should not throw if logManager.error is not a function', () => {
    const config = {
      logLevel: LogLevel.ERROR,
      logManager: { error: 'notAFunction' } as unknown as IFlagshipLogManager,
    } as IFlagshipConfig;

    expect(() => logError(config, message, tag)).not.toThrow();
  });

  it('should not throw if logManager is undefined', () => {
    const config = {
      logLevel: LogLevel.ERROR,
    } as IFlagshipConfig;

    expect(() => logError(config, message, tag)).not.toThrow();
  });
});

import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection } from './connection';
import { FlagEvaluationError } from './errors';
import { defineFlag } from './flag';
import { logger } from './logger';
import { runtime } from './runtime';

describe('logger', () => {
  beforeEach(() => {
    runtime.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes errors and warnings to the console', () => {
    logger.error('an error');
    logger.warn('a warning');

    expect(console.error).toHaveBeenCalledWith('an error');
    expect(console.warn).toHaveBeenCalledWith('a warning');
  });

  it('ignores info and debug messages', () => {
    logger.info('info');
    logger.debug('debug');

    expect(console.info).not.toHaveBeenCalled();
    expect(console.debug).not.toHaveBeenCalled();
  });

  it('logs one line when a flag returns its default value', async () => {
    const connection = defineConnection({
      provider: new TypedInMemoryProvider({}),
      project: { system: 'in-memory' },
    });
    const flag = defineFlag({
      key: 'missing',
      defaultValue: false,
      connection,
    });

    await flag();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      'flags: Could not evaluate flag "missing": no flag found with key missing. Returned the default value: false.',
    );
  });

  it('does not write the debug messages of providers', async () => {
    // The in-memory provider logs unknown keys at debug level
    const connection = defineConnection({
      provider: new TypedInMemoryProvider({}),
      project: { system: 'in-memory' },
    });
    const flag = defineFlag({
      key: 'missing',
      defaultValue: false,
      connection,
    });

    await flag();
    expect(console.debug).not.toHaveBeenCalled();
  });

  it('gives the full error to the debug level', async () => {
    const debug = vi.spyOn(logger, 'debug');
    const connection = defineConnection({
      provider: {
        metadata: { name: 'test' },
        resolveBooleanEvaluation: async () => {
          throw new Error('Oops');
        },
      },
      project: { system: 'in-memory' },
    });
    const flag = defineFlag({ key: 'a', defaultValue: true, connection });

    await flag();
    expect(debug).toHaveBeenCalledWith(expect.any(FlagEvaluationError));
  });

  it('does not write two periods when the message ends with one', async () => {
    const connection = defineConnection({
      provider: {
        metadata: { name: 'test' },
        resolveBooleanEvaluation: async () => {
          throw new Error('The service is down.');
        },
      },
      project: { system: 'in-memory' },
    });
    const flag = defineFlag({ key: 'a', defaultValue: true, connection });

    await flag();
    expect(console.error).toHaveBeenCalledWith(
      'flags: Could not evaluate flag "a": The service is down. Returned the default value: true.',
    );
  });
});

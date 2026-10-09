import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { defineConnection } from './connection';
import { FlagEvaluationError } from './errors';
import { defineFlag } from './flag';
import { logger } from './logger';
import { runtime } from './runtime';
import type { Provider, ResolutionDetails } from './types';

const myFlags = {
  v2_enabled: {
    variants: { on: true, off: false },
    disabled: false,
    defaultVariant: 'on',
  },
} as const;

function inMemoryConnection() {
  return defineConnection({
    provider: new TypedInMemoryProvider(myFlags),
    project: { platform: 'in-memory' },
  });
}

function customConnection(
  resolve: () => Promise<ResolutionDetails<unknown>>,
  initialize?: () => Promise<void>,
) {
  const provider = {
    metadata: { name: 'custom' },
    initialize,
    resolveBooleanEvaluation: vi.fn(resolve),
  } as Provider & { resolveBooleanEvaluation: ReturnType<typeof vi.fn> };
  return defineConnection({ provider, project: { platform: 'in-memory' } });
}

describe('defineFlag', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('evaluates the flag with the provider', async () => {
    const flag = defineFlag({
      key: 'v2_enabled',
      connection: inMemoryConnection(),
    });

    await expect(flag()).resolves.toBe(true);
    expect(console.error).not.toHaveBeenCalled();
    expectTypeOf(flag).returns.toEqualTypeOf<Promise<boolean>>();
  });

  it('exposes its definition and the connection', () => {
    const connection = defineConnection({
      provider: new TypedInMemoryProvider(myFlags),
      project: { platform: 'launchdarkly', projectId: 'x', teamId: 'y' },
    });
    const flag = defineFlag({
      key: 'v2_enabled',
      defaultValue: false,
      connection,
    });

    expect(flag.key).toBe('v2_enabled');
    expect(flag.defaultValue).toBe(false);
    expect(flag.connection).toBe(connection);
    expect(flag.connection.project).toEqual({
      platform: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
    });
    expectTypeOf(flag.key).toEqualTypeOf<'v2_enabled'>();
    expectTypeOf(flag.connection.project.teamId).toEqualTypeOf<string>();
  });

  it('passes an empty context and a logger to the provider', async () => {
    const connection = customConnection(async () => ({ value: true }));
    await defineFlag({ key: 'a', connection })();

    expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
      'a',
      false,
      {},
      logger,
    );
  });

  it('passes the default value to the provider', async () => {
    const connection = customConnection(async () => ({ value: true }));
    await defineFlag({ key: 'a', defaultValue: true, connection })();

    expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
      'a',
      true,
      {},
      logger,
    );
  });

  it('registers the connection', () => {
    const connection = inMemoryConnection();
    expect(runtime.connections).not.toContain(connection);

    defineFlag({ key: 'v2_enabled', connection });
    expect(runtime.connections).toContain(connection);
  });

  it('requires a connection returned by defineConnection', () => {
    const connection = {
      provider: new TypedInMemoryProvider(myFlags),
      project: { platform: 'in-memory' as const },
    };

    expect(() => defineFlag({ key: 'v2_enabled', connection })).toThrow(
      'flags: The connection of flag "v2_enabled" must be returned by defineConnection.',
    );
  });

  it('requires a connection, not a provider', () => {
    const provider = new TypedInMemoryProvider(myFlags);
    const options = { key: 'v2_enabled', connection: provider };

    // @ts-expect-error a provider is not a connection
    expect(() => defineFlag(options)).toThrow(
      'flags: The connection of flag "v2_enabled" must be returned by defineConnection.',
    );
  });

  describe('when the provider throws', () => {
    it('returns the default value', async () => {
      const flag = defineFlag({
        key: 'missing',
        defaultValue: true,
        connection: inMemoryConnection(),
      });

      await expect(flag()).resolves.toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not evaluate flag "missing": no flag found with key missing. Returned the default value: true.',
      );
    });

    it('throws without a default value', async () => {
      const flag = defineFlag({
        key: 'missing',
        connection: inMemoryConnection(),
      });

      const error = await flag().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(FlagEvaluationError);
      expect(error).toMatchObject({
        flagKey: 'missing',
        code: 'FLAG_NOT_FOUND',
        message: expect.stringContaining(
          'flags: Could not evaluate flag "missing":',
        ),
        cause: expect.any(Error),
      });
    });

    it('uses GENERAL for errors without a code', async () => {
      const connection = customConnection(async () => {
        throw 'oops';
      });

      await expect(
        defineFlag({ key: 'a', connection })(),
      ).rejects.toMatchObject({
        code: 'GENERAL',
        message: 'flags: Could not evaluate flag "a": oops',
        cause: 'oops',
      });
    });
  });

  describe('when the provider returns an error code', () => {
    const resolve = async () => ({
      value: false,
      errorCode: 'PARSE_ERROR',
      errorMessage: 'Invalid configuration',
    });

    it('returns the default value', async () => {
      const flag = defineFlag({
        key: 'a',
        defaultValue: true,
        connection: customConnection(resolve),
      });

      await expect(flag()).resolves.toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not evaluate flag "a": Invalid configuration. Returned the default value: true.',
      );
    });

    it('throws without a default value', async () => {
      const flag = defineFlag({
        key: 'a',
        connection: customConnection(resolve),
      });

      await expect(flag()).rejects.toMatchObject({
        name: 'FlagEvaluationError',
        flagKey: 'a',
        code: 'PARSE_ERROR',
        message: 'flags: Could not evaluate flag "a": Invalid configuration',
      });
    });
  });

  it('throws when the provider returns a non-boolean value', async () => {
    const connection = customConnection(async () => ({ value: 'on' }));

    await expect(defineFlag({ key: 'a', connection })()).rejects.toMatchObject({
      code: 'TYPE_MISMATCH',
      message:
        'flags: Could not evaluate flag "a": Expected a boolean, got string',
    });
  });

  describe('initialization', () => {
    it('initializes the provider once', async () => {
      const initialize = vi.fn(async () => {});
      const connection = customConnection(
        async () => ({ value: true }),
        initialize,
      );
      const a = defineFlag({ key: 'a', connection });
      const b = defineFlag({ key: 'b', connection });

      expect(initialize).not.toHaveBeenCalled();
      await Promise.all([a(), b(), a()]);
      await a();
      expect(initialize).toHaveBeenCalledTimes(1);
    });

    it('evaluates after initialization finished', async () => {
      const order: string[] = [];
      const connection = customConnection(
        async () => {
          order.push('resolve');
          return { value: true };
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          order.push('initialize');
        },
      );

      await defineFlag({ key: 'a', connection })();
      expect(order).toEqual(['initialize', 'resolve']);
    });

    it('retries a failed initialization', async () => {
      const initialize = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue(undefined);
      const connection = customConnection(
        async () => ({ value: true }),
        initialize,
      );
      const flag = defineFlag({ key: 'a', connection });

      await expect(flag()).rejects.toMatchObject({
        code: 'GENERAL',
        message: 'flags: Could not evaluate flag "a": Network error',
      });
      await expect(flag()).resolves.toBe(true);
      expect(initialize).toHaveBeenCalledTimes(2);
    });

    it('handles initialize throwing synchronously', async () => {
      const connection = customConnection(
        async () => ({ value: true }),
        (() => {
          throw new Error('Sync error');
        }) as () => Promise<void>,
      );

      await expect(
        defineFlag({ key: 'a', connection })(),
      ).rejects.toMatchObject({
        message: 'flags: Could not evaluate flag "a": Sync error',
      });
    });

    it('returns the default value when initialization fails', async () => {
      const connection = customConnection(
        async () => ({ value: false }),
        async () => {
          throw new Error('Network error');
        },
      );

      await expect(
        defineFlag({ key: 'a', defaultValue: true, connection })(),
      ).resolves.toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not evaluate flag "a": Network error. Returned the default value: true.',
      );
    });
  });

  it('keeps the literal type of the key', () => {
    const flag = defineFlag({
      key: 'anything',
      connection: inMemoryConnection(),
    });
    expectTypeOf(flag.key).toEqualTypeOf<'anything'>();
  });
});

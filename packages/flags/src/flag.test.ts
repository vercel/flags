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
import { FlagEvaluationError } from './errors';
import { bindFlag } from './flag';
import { logger } from './logger';
import { runtime } from './runtime';
import { defineSource } from './source';
import type { Provider, ResolutionDetails } from './types';

const myFlags = {
  v2_enabled: {
    variants: { on: true, off: false },
    disabled: false,
    defaultVariant: 'on',
  },
} as const;

function inMemorySource() {
  return defineSource({
    provider: new TypedInMemoryProvider(myFlags),
    project: { system: 'in-memory' },
  });
}

function customSource(
  resolve: () => Promise<ResolutionDetails<unknown>>,
  initialize?: () => Promise<void>,
) {
  const provider = {
    metadata: { name: 'custom' },
    initialize,
    resolveBooleanEvaluation: vi.fn(resolve),
  } as Provider & { resolveBooleanEvaluation: ReturnType<typeof vi.fn> };
  return defineSource({ provider, project: { system: 'in-memory' } });
}

describe('bindFlag', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('evaluates the flag with the provider', async () => {
    const flag = bindFlag({
      key: 'v2_enabled',
      source: inMemorySource(),
    });

    await expect(flag()).resolves.toBe(true);
    expect(console.error).not.toHaveBeenCalled();
    expectTypeOf(flag).returns.toEqualTypeOf<Promise<boolean>>();
  });

  it('exposes its definition and the source', () => {
    const source = defineSource({
      provider: new TypedInMemoryProvider(myFlags),
      project: { system: 'launchdarkly', projectId: 'x', teamId: 'y' },
    });
    const flag = bindFlag({
      key: 'v2_enabled',
      defaultValue: false,
      source,
    });

    expect(flag.key).toBe('v2_enabled');
    expect(flag.defaultValue).toBe(false);
    expect(flag.source).toBe(source);
    expect(flag.source.project).toEqual({
      system: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
    });
    expectTypeOf(flag.key).toEqualTypeOf<'v2_enabled'>();
    expectTypeOf(flag.source.project?.teamId).toEqualTypeOf<
      string | undefined
    >();
  });

  it('passes an empty context and a logger to the provider', async () => {
    const source = customSource(async () => ({ value: true }));
    await bindFlag({ key: 'a', source })();

    expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
      'a',
      false,
      {},
      logger,
    );
  });

  it('passes the default value to the provider', async () => {
    const source = customSource(async () => ({ value: true }));
    await bindFlag({ key: 'a', defaultValue: true, source })();

    expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
      'a',
      true,
      {},
      logger,
    );
  });

  it('registers the source', () => {
    const source = inMemorySource();
    expect(runtime.sources).not.toContain(source);

    bindFlag({ key: 'v2_enabled', source });
    expect(runtime.sources).toContain(source);
  });

  it('requires a source returned by defineSource', () => {
    const source = {
      provider: new TypedInMemoryProvider(myFlags),
      project: { system: 'in-memory' as const },
    };

    expect(() => bindFlag({ key: 'v2_enabled', source })).toThrow(
      'flags: The source of flag "v2_enabled" must be returned by defineSource.',
    );
  });

  it('requires a source, not a provider', () => {
    const provider = new TypedInMemoryProvider(myFlags);
    const options = { key: 'v2_enabled', source: provider };

    // @ts-expect-error a provider is not a source
    expect(() => bindFlag(options)).toThrow(
      'flags: The source of flag "v2_enabled" must be returned by defineSource.',
    );
  });

  describe('when the provider throws', () => {
    it('returns the default value', async () => {
      const flag = bindFlag({
        key: 'missing',
        defaultValue: true,
        source: inMemorySource(),
      });

      await expect(flag()).resolves.toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not evaluate flag "missing": no flag found with key missing. Returned the default value: true.',
      );
    });

    it('throws without a default value', async () => {
      const flag = bindFlag({
        key: 'missing',
        source: inMemorySource(),
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
      const source = customSource(async () => {
        throw 'oops';
      });

      await expect(bindFlag({ key: 'a', source })()).rejects.toMatchObject({
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
      const flag = bindFlag({
        key: 'a',
        defaultValue: true,
        source: customSource(resolve),
      });

      await expect(flag()).resolves.toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not evaluate flag "a": Invalid configuration. Returned the default value: true.',
      );
    });

    it('throws without a default value', async () => {
      const flag = bindFlag({
        key: 'a',
        source: customSource(resolve),
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
    const source = customSource(async () => ({ value: 'on' }));

    await expect(bindFlag({ key: 'a', source })()).rejects.toMatchObject({
      code: 'TYPE_MISMATCH',
      message:
        'flags: Could not evaluate flag "a": Expected a boolean, got string',
    });
  });

  describe('initialization', () => {
    it('initializes the provider once', async () => {
      const initialize = vi.fn(async () => {});
      const source = customSource(async () => ({ value: true }), initialize);
      const a = bindFlag({ key: 'a', source });
      const b = bindFlag({ key: 'b', source });

      expect(initialize).not.toHaveBeenCalled();
      await Promise.all([a(), b(), a()]);
      await a();
      expect(initialize).toHaveBeenCalledTimes(1);
    });

    it('evaluates after initialization finished', async () => {
      const order: string[] = [];
      const source = customSource(
        async () => {
          order.push('resolve');
          return { value: true };
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          order.push('initialize');
        },
      );

      await bindFlag({ key: 'a', source })();
      expect(order).toEqual(['initialize', 'resolve']);
    });

    it('retries a failed initialization', async () => {
      const initialize = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue(undefined);
      const source = customSource(async () => ({ value: true }), initialize);
      const flag = bindFlag({ key: 'a', source });

      await expect(flag()).rejects.toMatchObject({
        code: 'GENERAL',
        message: 'flags: Could not evaluate flag "a": Network error',
      });
      await expect(flag()).resolves.toBe(true);
      expect(initialize).toHaveBeenCalledTimes(2);
    });

    it('handles initialize throwing synchronously', async () => {
      const source = customSource(async () => ({ value: true }), (() => {
        throw new Error('Sync error');
      }) as () => Promise<void>);

      await expect(bindFlag({ key: 'a', source })()).rejects.toMatchObject({
        message: 'flags: Could not evaluate flag "a": Sync error',
      });
    });

    it('returns the default value when initialization fails', async () => {
      const source = customSource(
        async () => ({ value: false }),
        async () => {
          throw new Error('Network error');
        },
      );

      await expect(
        bindFlag({ key: 'a', defaultValue: true, source })(),
      ).resolves.toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not evaluate flag "a": Network error. Returned the default value: true.',
      );
    });
  });

  it('keeps the literal type of the key', () => {
    const flag = bindFlag({
      key: 'anything',
      source: inMemorySource(),
    });
    expectTypeOf(flag.key).toEqualTypeOf<'anything'>();
  });
});

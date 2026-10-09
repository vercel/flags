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
import { defineFlag, FlagEvaluationError } from './flag';
import { defineProject } from './project';
import { getRegisteredProviders } from './providers';
import {
  type Provider,
  type ProviderExtension,
  providerExtension,
  type ResolutionDetails,
} from './types';

const myFlags = {
  v2_enabled: {
    variants: { on: true, off: false },
    disabled: false,
    defaultVariant: 'on',
  },
} as const;

function inMemoryProject() {
  return defineProject(new TypedInMemoryProvider(myFlags), {
    provider: 'in-memory',
  });
}

function customProject(
  resolve: () => Promise<ResolutionDetails<unknown>>,
  initialize?: () => Promise<void>,
) {
  const provider = {
    metadata: { name: 'custom' },
    initialize,
    resolveBooleanEvaluation: vi.fn(resolve),
  } as Provider & { resolveBooleanEvaluation: ReturnType<typeof vi.fn> };
  return defineProject(provider, { provider: 'in-memory' });
}

describe('defineFlag', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('evaluates the flag with the provider', async () => {
    const flag = defineFlag({ key: 'v2_enabled', provider: inMemoryProject() });

    await expect(flag()).resolves.toBe(true);
    expect(console.error).not.toHaveBeenCalled();
    expectTypeOf(flag).returns.toEqualTypeOf<Promise<boolean>>();
  });

  it('exposes its definition and the project metadata', () => {
    const provider = defineProject(new TypedInMemoryProvider(myFlags), {
      provider: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
    });
    const flag = defineFlag({
      key: 'v2_enabled',
      defaultValue: false,
      provider,
    });

    expect(flag.key).toBe('v2_enabled');
    expect(flag.defaultValue).toBe(false);
    expect(flag.provider).toBe(provider);
    expect(flag.provider.metadata).toEqual({
      name: 'in-memory',
      provider: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
    });
    expectTypeOf(flag.key).toEqualTypeOf<'v2_enabled'>();
    expectTypeOf(flag.provider.metadata.teamId).toEqualTypeOf<string>();
  });

  it('passes an empty context and a logger to the provider', async () => {
    const project = customProject(async () => ({ value: true }));
    await defineFlag({ key: 'a', provider: project })();

    expect(project.resolveBooleanEvaluation).toHaveBeenCalledWith(
      'a',
      false,
      {},
      console,
    );
  });

  it('passes the default value to the provider', async () => {
    const project = customProject(async () => ({ value: true }));
    await defineFlag({ key: 'a', defaultValue: true, provider: project })();

    expect(project.resolveBooleanEvaluation).toHaveBeenCalledWith(
      'a',
      true,
      {},
      console,
    );
  });

  it('registers the provider', () => {
    const provider = inMemoryProject();
    expect(getRegisteredProviders()).not.toContain(provider);

    defineFlag({ key: 'v2_enabled', provider });
    expect(getRegisteredProviders()).toContain(provider);
  });

  it('requires a provider returned by defineProject', () => {
    const provider = new TypedInMemoryProvider(myFlags);

    expect(() =>
      // @ts-expect-error the provider was not passed to defineProject
      defineFlag({ key: 'v2_enabled', provider }),
    ).toThrow(
      'flags: The provider of flag "v2_enabled" must be returned by defineProject.',
    );
  });

  describe('when the provider throws', () => {
    it('returns the default value', async () => {
      const flag = defineFlag({
        key: 'missing',
        defaultValue: true,
        provider: inMemoryProject(),
      });

      await expect(flag()).resolves.toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'FlagEvaluationError',
          flagKey: 'missing',
          code: 'FLAG_NOT_FOUND',
        }),
      );
    });

    it('throws without a default value', async () => {
      const flag = defineFlag({ key: 'missing', provider: inMemoryProject() });

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
      const project = customProject(async () => {
        throw 'oops';
      });

      await expect(
        defineFlag({ key: 'a', provider: project })(),
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
        provider: customProject(resolve),
      });

      await expect(flag()).resolves.toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'flags: Could not evaluate flag "a": Invalid configuration',
          code: 'PARSE_ERROR',
        }),
      );
    });

    it('throws without a default value', async () => {
      const flag = defineFlag({ key: 'a', provider: customProject(resolve) });

      await expect(flag()).rejects.toMatchObject({
        name: 'FlagEvaluationError',
        flagKey: 'a',
        code: 'PARSE_ERROR',
        message: 'flags: Could not evaluate flag "a": Invalid configuration',
      });
    });
  });

  it('throws when the provider returns a non-boolean value', async () => {
    const project = customProject(async () => ({ value: 'on' }));

    await expect(
      defineFlag({ key: 'a', provider: project })(),
    ).rejects.toMatchObject({
      code: 'TYPE_MISMATCH',
      message:
        'flags: Could not evaluate flag "a": Expected a boolean, got string',
    });
  });

  describe('initialization', () => {
    it('initializes the provider once', async () => {
      const initialize = vi.fn(async () => {});
      const project = customProject(async () => ({ value: true }), initialize);
      const a = defineFlag({ key: 'a', provider: project });
      const b = defineFlag({ key: 'b', provider: project });

      expect(initialize).not.toHaveBeenCalled();
      await Promise.all([a(), b(), a()]);
      await a();
      expect(initialize).toHaveBeenCalledTimes(1);
    });

    it('evaluates after initialization finished', async () => {
      const order: string[] = [];
      const project = customProject(
        async () => {
          order.push('resolve');
          return { value: true };
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          order.push('initialize');
        },
      );

      await defineFlag({ key: 'a', provider: project })();
      expect(order).toEqual(['initialize', 'resolve']);
    });

    it('retries a failed initialization', async () => {
      const initialize = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue(undefined);
      const project = customProject(async () => ({ value: true }), initialize);
      const flag = defineFlag({ key: 'a', provider: project });

      await expect(flag()).rejects.toMatchObject({
        code: 'GENERAL',
        message: 'flags: Could not evaluate flag "a": Network error',
      });
      await expect(flag()).resolves.toBe(true);
      expect(initialize).toHaveBeenCalledTimes(2);
    });

    it('returns the default value when initialization fails', async () => {
      const project = customProject(
        async () => ({ value: false }),
        async () => {
          throw new Error('Network error');
        },
      );

      await expect(
        defineFlag({ key: 'a', defaultValue: true, provider: project })(),
      ).resolves.toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'flags: Could not evaluate flag "a": Network error',
        }),
      );
    });
  });

  describe('flag keys', () => {
    it('accepts any key when the provider does not declare keys', () => {
      const flag = defineFlag({ key: 'anything', provider: inMemoryProject() });
      expectTypeOf(flag.key).toEqualTypeOf<'anything'>();
    });

    it('only accepts keys the provider declares', () => {
      class TypedProvider implements Provider {
        readonly metadata = { name: 'typed' };
        declare readonly [providerExtension]?: ProviderExtension<'a' | 'b'>;
        async resolveBooleanEvaluation(_key: string, value: boolean) {
          return { value };
        }
      }
      const provider = defineProject(new TypedProvider(), {
        provider: 'in-memory',
      });

      const flag = defineFlag({ key: 'a', provider });
      expectTypeOf(flag.key).toEqualTypeOf<'a'>();

      // @ts-expect-error the provider does not declare key "c"
      defineFlag({ key: 'c', provider });
    });
  });
});

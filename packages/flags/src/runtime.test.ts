import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { bindFlag } from './flag';
import { logger } from './logger';
import { registerSources } from './register';
import { type FlagDefinition, runtime } from './runtime';
import { defineSource } from './source';
import type { Provider } from './types';

function createSource(name = 'test') {
  const provider = {
    metadata: { name },
    initialize: vi.fn<() => Promise<void>>(async () => {}),
    onClose: vi.fn<() => Promise<void>>(async () => {}),
    resolveBooleanEvaluation: vi.fn(async () => ({ value: true })),
  } satisfies Provider;
  return defineSource({ provider, project: { system: 'in-memory' } });
}

/**
 * Returns a promise and the function to resolve it.
 */
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const headers = new Headers();

describe('runtime', () => {
  beforeEach(() => {
    runtime.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onInit', () => {
    it('initializes the providers of registered sources', async () => {
      const source = createSource();
      registerSources([source]);

      await runtime.onInit();
      expect(source.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('initializes the providers of defined flags', async () => {
      const source = createSource();
      bindFlag({ key: 'a', source });

      await runtime.onInit();
      expect(source.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('waits for the initializations', async () => {
      const source = createSource();
      const init = deferred();
      source.provider.initialize.mockReturnValue(init.promise);
      registerSources([source]);

      let finished = false;
      const onInit = runtime.onInit().then(() => {
        finished = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(finished).toBe(false);

      init.resolve();
      await onInit;
      expect(finished).toBe(true);
    });

    it('initializes a provider shared by sources once', async () => {
      const a = createSource();
      const b = defineSource({
        provider: a.provider,
        project: { system: 'launchdarkly', projectId: 'x', teamId: 'y' },
      });
      registerSources([a, b]);

      await runtime.onInit();
      expect(a.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('does not initialize again for evaluations', async () => {
      const source = createSource();
      const flag = bindFlag({ key: 'a', source });

      await runtime.onInit();
      await flag();
      expect(source.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('logs failures and initializes the other providers', async () => {
      const failing = createSource('failing');
      const error = new Error('Network error');
      failing.provider.initialize.mockRejectedValueOnce(error);
      const working = createSource('working');
      registerSources([failing, working]);

      await expect(runtime.onInit()).resolves.toBeUndefined();
      expect(working.provider.initialize).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not initialize provider "failing".',
        error,
      );
    });

    it('lets the next evaluation retry a failed initialization', async () => {
      const source = createSource();
      source.provider.initialize.mockRejectedValueOnce(new Error('Oops'));
      const flag = bindFlag({ key: 'a', source });

      await runtime.onInit();
      await expect(flag()).resolves.toBe(true);
      expect(source.provider.initialize).toHaveBeenCalledTimes(2);
    });
  });

  describe('onInvoke', () => {
    it('starts the initialization before it returns', () => {
      const source = createSource();
      source.provider.initialize.mockReturnValue(deferred().promise);
      registerSources([source]);

      void runtime.onInvoke({ headers }, () => {});
      expect(source.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('does not wait for the initializations', async () => {
      const source = createSource();
      source.provider.initialize.mockReturnValue(deferred().promise);
      registerSources([source]);

      await expect(runtime.onInvoke({ headers }, () => 'result')).resolves.toBe(
        'result',
      );
    });

    it('does not let a slow provider delay flags of other providers', async () => {
      const slow = createSource('slow');
      const slowInit = deferred();
      slow.provider.initialize.mockReturnValue(slowInit.promise);
      const fast = createSource('fast');
      const slowFlag = bindFlag({ key: 'a', source: slow });
      const fastFlag = bindFlag({ key: 'b', source: fast });

      await runtime.onInvoke({ headers }, async () => {
        await expect(fastFlag()).resolves.toBe(true);
        expect(slow.provider.resolveBooleanEvaluation).not.toHaveBeenCalled();

        const pending = slowFlag();
        slowInit.resolve();
        await expect(pending).resolves.toBe(true);
      });
    });

    it('lets flags wait for the initialization it started', async () => {
      const source = createSource();
      const init = deferred();
      source.provider.initialize.mockReturnValue(init.promise);
      const flag = bindFlag({ key: 'a', source });

      void runtime.onInvoke({ headers }, () => {});
      const pending = flag();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(source.provider.resolveBooleanEvaluation).not.toHaveBeenCalled();

      init.resolve();
      await expect(pending).resolves.toBe(true);
      expect(source.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('initializes providers which were registered after onInit', async () => {
      await runtime.onInit();

      const source = createSource();
      registerSources([source]);
      void runtime.onInvoke({ headers }, () => {});
      expect(source.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('retries failed initializations', async () => {
      const source = createSource();
      source.provider.initialize.mockRejectedValueOnce(new Error('Oops'));
      registerSources([source]);

      await runtime.onInit();
      void runtime.onInvoke({ headers }, () => {});
      expect(source.provider.initialize).toHaveBeenCalledTimes(2);
    });

    it('does not initialize again after a successful initialization', async () => {
      const source = createSource();
      registerSources([source]);

      await runtime.onInit();
      void runtime.onInvoke({ headers }, () => {});
      void runtime.onInvoke({ headers }, () => {});
      expect(source.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('does not throw or log when an initialization fails', async () => {
      const source = createSource();
      source.provider.initialize.mockRejectedValue(new Error('Oops'));
      registerSources([source]);

      await runtime.onInvoke({ headers }, () => {});
      await runtime.waitForInitialization();
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('waitForInitialization', () => {
    it('waits for running initializations', async () => {
      const source = createSource();
      const init = deferred();
      source.provider.initialize.mockReturnValue(init.promise);
      registerSources([source]);

      let finished = false;
      void runtime.onInvoke({ headers }, () => {});
      const waiting = runtime.waitForInitialization().then(() => {
        finished = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(finished).toBe(false);

      init.resolve();
      await waiting;
      expect(finished).toBe(true);
    });

    it('does not throw when an initialization fails', async () => {
      const source = createSource();
      source.provider.initialize.mockRejectedValue(new Error('Oops'));
      registerSources([source]);

      void runtime.onInvoke({ headers }, () => {});
      await expect(runtime.waitForInitialization()).resolves.toBeUndefined();
    });

    it('resolves when nothing is initializing', async () => {
      await expect(runtime.waitForInitialization()).resolves.toBeUndefined();
    });
  });

  describe('onShutdown', () => {
    it('closes initialized providers', async () => {
      const source = createSource();
      registerSources([source]);

      await runtime.onInit();
      await runtime.onShutdown();
      expect(source.provider.onClose).toHaveBeenCalledTimes(1);
    });

    it('closes providers which were initialized by an evaluation', async () => {
      const source = createSource();
      const flag = bindFlag({ key: 'a', source });

      await flag();
      await runtime.onShutdown();
      expect(source.provider.onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close providers which were never initialized', async () => {
      const source = createSource();
      registerSources([source]);

      await runtime.onShutdown();
      expect(source.provider.onClose).not.toHaveBeenCalled();
    });

    it('does not close providers whose initialization failed', async () => {
      const source = createSource();
      source.provider.initialize.mockRejectedValueOnce(new Error('Oops'));
      registerSources([source]);

      await runtime.onInit();
      await runtime.onShutdown();
      expect(source.provider.onClose).not.toHaveBeenCalled();
    });

    it('waits for running initializations before closing', async () => {
      const order: string[] = [];
      const source = createSource();
      const init = deferred();
      source.provider.initialize.mockImplementation(async () => {
        await init.promise;
        order.push('initialize');
      });
      source.provider.onClose.mockImplementation(async () => {
        order.push('close');
      });
      registerSources([source]);

      void runtime.onInvoke({ headers }, () => {});
      const shutdown = runtime.onShutdown();
      init.resolve();
      await shutdown;
      expect(order).toEqual(['initialize', 'close']);
    });

    it('logs errors and closes the other providers', async () => {
      const failing = createSource('failing');
      const error = new Error('Oops');
      failing.provider.onClose.mockRejectedValue(error);
      const working = createSource('working');
      registerSources([failing, working]);

      await runtime.onInit();
      await expect(runtime.onShutdown()).resolves.toBeUndefined();
      expect(working.provider.onClose).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not close provider "failing".',
        error,
      );
    });

    it('initializes providers again when used after a shutdown', async () => {
      const source = createSource();
      const flag = bindFlag({ key: 'a', source });

      await runtime.onInit();
      await runtime.onShutdown();
      await flag();
      expect(source.provider.initialize).toHaveBeenCalledTimes(2);
    });
  });

  describe('evaluate', () => {
    it('evaluates a flag returned by bindFlag', async () => {
      const source = createSource();
      const flag = bindFlag({ key: 'a', source });

      await expect(runtime.evaluate(flag)).resolves.toBe(true);
      expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'a',
        false,
        {},
        logger,
      );
      expectTypeOf(flag).toExtend<FlagDefinition>();
      expectTypeOf(runtime.evaluate(flag)).toEqualTypeOf<Promise<boolean>>();
    });

    it('evaluates a key which is only known at runtime', async () => {
      const source = createSource();
      const key = ['new', 'checkout'].join('-');

      await expect(
        runtime.evaluate({ key, source, defaultValue: false }),
      ).resolves.toBe(true);
      expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'new-checkout',
        false,
        {},
        logger,
      );
    });

    it('initializes the provider of a source which is not registered', async () => {
      const source = createSource();
      runtime.reset();

      await runtime.evaluate({ key: 'a', source });
      expect(source.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('uses the context of the current request', async () => {
      const provider = {
        metadata: { name: 'test' },
        resolveBooleanEvaluation: vi.fn(async () => ({ value: true })),
      } satisfies Provider;
      const source = defineSource({
        provider,
        project: { system: 'in-memory' },
        getEvaluationContext: (_context, request) => ({
          targetingKey: request?.headers?.get('x-user') ?? 'anonymous',
        }),
      });

      await runtime.onInvoke(
        { headers: new Headers({ 'x-user': 'alice' }) },
        () => runtime.evaluate({ key: 'a', source }),
      );
      expect(provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'a',
        false,
        { targetingKey: 'alice' },
        logger,
      );
    });

    it('returns the default value when the evaluation fails', async () => {
      const source = createSource();
      source.provider.resolveBooleanEvaluation.mockRejectedValue(
        new Error('Oops'),
      );

      await expect(
        runtime.evaluate({ key: 'a', source, defaultValue: false }),
      ).resolves.toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not evaluate flag "a": Oops. Returned the default value: false.',
      );
    });

    it('rejects with a FlagEvaluationError without a default value', async () => {
      const source = createSource();
      source.provider.resolveBooleanEvaluation.mockRejectedValue(
        new Error('Oops'),
      );

      await expect(
        runtime.evaluate({ key: 'a', source }),
      ).rejects.toMatchObject({
        name: 'FlagEvaluationError',
        message: 'flags: Could not evaluate flag "a": Oops',
      });
    });

    it('requires a source returned by defineSource', async () => {
      const source = {
        provider: createSource().provider,
        project: { system: 'in-memory' as const },
      };

      await expect(runtime.evaluate({ key: 'a', source })).rejects.toThrow(
        'flags: The source of flag "a" must be returned by defineSource.',
      );
    });
  });

  describe('setRethrow', () => {
    class FrameworkSignal extends Error {}
    const rethrow = (error: unknown) => {
      if (error instanceof FrameworkSignal) throw error;
    };

    it('lets a signal of the framework through, also with a defaultValue', async () => {
      runtime.setRethrow(rethrow);
      const signal = new FrameworkSignal('Dynamic server usage');
      runtime.setGetRequest(() => {
        throw signal;
      });
      const flag = bindFlag({
        key: 'a',
        defaultValue: false,
        source: createSource(),
      });

      await expect(flag()).rejects.toBe(signal);
    });

    it('lets a signal of a step through', async () => {
      runtime.setRethrow(rethrow);
      const signal = new FrameworkSignal('Postponed');
      const source = defineSource({
        provider: createSource().provider,
        project: { system: 'in-memory' },
        getEvaluationContext: () => {
          throw signal;
        },
      });

      await expect(
        bindFlag({ key: 'a', defaultValue: false, source })(),
      ).rejects.toBe(signal);
    });

    it('handles other errors as usual', async () => {
      runtime.setRethrow(rethrow);
      runtime.setGetRequest(() => {
        throw new Error('Other error');
      });

      await expect(
        bindFlag({
          key: 'a',
          defaultValue: false,
          source: createSource(),
        })(),
      ).resolves.toBe(false);
    });
  });

  describe('setLoadConfig', () => {
    const sourceWith = (value: boolean) =>
      defineSource({
        provider: {
          metadata: { name: `value-${value}` },
          resolveBooleanEvaluation: async () => ({ value }),
        },
        project: { system: 'in-memory' },
      });

    it('loads the configuration before the first evaluation', async () => {
      const config = { defaultSource: sourceWith(true) };
      runtime.setLoadConfig(() => config);

      await expect(bindFlag({ key: 'a' })()).resolves.toBe(true);
    });

    it('loads a changed configuration in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      let config = { defaultSource: sourceWith(true) };
      runtime.setLoadConfig(() => config);
      const flag = bindFlag({ key: 'a' });

      await expect(flag()).resolves.toBe(true);
      config = { defaultSource: sourceWith(false) };
      await expect(flag()).resolves.toBe(false);
      vi.unstubAllEnvs();
    });

    it('loads the configuration one time in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const loadConfig = vi.fn(() => ({ defaultSource: sourceWith(true) }));
      runtime.setLoadConfig(loadConfig);
      const flag = bindFlag({ key: 'a' });

      await flag();
      await flag();
      expect(loadConfig).toHaveBeenCalledTimes(1);
      vi.unstubAllEnvs();
    });

    it('fails the evaluation when the configuration can not be loaded', async () => {
      runtime.setLoadConfig(() => {
        throw new Error('flags/config.ts has an error');
      });

      await expect(
        bindFlag({ key: 'a', source: sourceWith(true) })(),
      ).rejects.toThrow('flags/config.ts has an error');
    });
  });

  it('supports providers without initialize and onClose', async () => {
    const source = defineSource({
      provider: {
        metadata: { name: 'minimal' },
        resolveBooleanEvaluation: async () => ({ value: true }),
      },
      project: { system: 'in-memory' },
    });
    const flag = bindFlag({ key: 'a', source });

    await runtime.onInit();
    await runtime.onInvoke({ headers }, () => {});
    await expect(flag()).resolves.toBe(true);
    await runtime.onShutdown();
  });
});

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
import { defineFlag } from './flag';
import { registerConnections } from './register';
import { type FlagDefinition, runtime } from './runtime';
import type { Provider } from './types';

function createConnection(name = 'test') {
  const provider = {
    metadata: { name },
    initialize: vi.fn<() => Promise<void>>(async () => {}),
    onClose: vi.fn<() => Promise<void>>(async () => {}),
    resolveBooleanEvaluation: vi.fn(async () => ({ value: true })),
  } satisfies Provider;
  return defineConnection({ provider, project: { platform: 'in-memory' } });
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
    it('initializes the providers of registered connections', async () => {
      const connection = createConnection();
      registerConnections([connection]);

      await runtime.onInit();
      expect(connection.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('initializes the providers of defined flags', async () => {
      const connection = createConnection();
      defineFlag({ key: 'a', connection });

      await runtime.onInit();
      expect(connection.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('waits for the initializations', async () => {
      const connection = createConnection();
      const init = deferred();
      connection.provider.initialize.mockReturnValue(init.promise);
      registerConnections([connection]);

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

    it('initializes a provider shared by connections once', async () => {
      const a = createConnection();
      const b = defineConnection({
        provider: a.provider,
        project: { platform: 'launchdarkly', projectId: 'x', teamId: 'y' },
      });
      registerConnections([a, b]);

      await runtime.onInit();
      expect(a.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('does not initialize again for evaluations', async () => {
      const connection = createConnection();
      const flag = defineFlag({ key: 'a', connection });

      await runtime.onInit();
      await flag();
      expect(connection.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('logs failures and initializes the other providers', async () => {
      const failing = createConnection('failing');
      const error = new Error('Network error');
      failing.provider.initialize.mockRejectedValueOnce(error);
      const working = createConnection('working');
      registerConnections([failing, working]);

      await expect(runtime.onInit()).resolves.toBeUndefined();
      expect(working.provider.initialize).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not initialize provider "failing".',
        error,
      );
    });

    it('lets the next evaluation retry a failed initialization', async () => {
      const connection = createConnection();
      connection.provider.initialize.mockRejectedValueOnce(new Error('Oops'));
      const flag = defineFlag({ key: 'a', connection });

      await runtime.onInit();
      await expect(flag()).resolves.toBe(true);
      expect(connection.provider.initialize).toHaveBeenCalledTimes(2);
    });
  });

  describe('onInvoke', () => {
    it('starts the initialization before it returns', () => {
      const connection = createConnection();
      connection.provider.initialize.mockReturnValue(deferred().promise);
      registerConnections([connection]);

      void runtime.onInvoke({ headers }, () => {});
      expect(connection.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('does not wait for the initializations', async () => {
      const connection = createConnection();
      connection.provider.initialize.mockReturnValue(deferred().promise);
      registerConnections([connection]);

      await expect(runtime.onInvoke({ headers }, () => 'result')).resolves.toBe(
        'result',
      );
    });

    it('does not let a slow provider delay flags of other providers', async () => {
      const slow = createConnection('slow');
      const slowInit = deferred();
      slow.provider.initialize.mockReturnValue(slowInit.promise);
      const fast = createConnection('fast');
      const slowFlag = defineFlag({ key: 'a', connection: slow });
      const fastFlag = defineFlag({ key: 'b', connection: fast });

      await runtime.onInvoke({ headers }, async () => {
        await expect(fastFlag()).resolves.toBe(true);
        expect(slow.provider.resolveBooleanEvaluation).not.toHaveBeenCalled();

        const pending = slowFlag();
        slowInit.resolve();
        await expect(pending).resolves.toBe(true);
      });
    });

    it('lets flags wait for the initialization it started', async () => {
      const connection = createConnection();
      const init = deferred();
      connection.provider.initialize.mockReturnValue(init.promise);
      const flag = defineFlag({ key: 'a', connection });

      void runtime.onInvoke({ headers }, () => {});
      const pending = flag();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        connection.provider.resolveBooleanEvaluation,
      ).not.toHaveBeenCalled();

      init.resolve();
      await expect(pending).resolves.toBe(true);
      expect(connection.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('initializes providers which were registered after onInit', async () => {
      await runtime.onInit();

      const connection = createConnection();
      registerConnections([connection]);
      void runtime.onInvoke({ headers }, () => {});
      expect(connection.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('retries failed initializations', async () => {
      const connection = createConnection();
      connection.provider.initialize.mockRejectedValueOnce(new Error('Oops'));
      registerConnections([connection]);

      await runtime.onInit();
      void runtime.onInvoke({ headers }, () => {});
      expect(connection.provider.initialize).toHaveBeenCalledTimes(2);
    });

    it('does not initialize again after a successful initialization', async () => {
      const connection = createConnection();
      registerConnections([connection]);

      await runtime.onInit();
      void runtime.onInvoke({ headers }, () => {});
      void runtime.onInvoke({ headers }, () => {});
      expect(connection.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('does not throw or log when an initialization fails', async () => {
      const connection = createConnection();
      connection.provider.initialize.mockRejectedValue(new Error('Oops'));
      registerConnections([connection]);

      await runtime.onInvoke({ headers }, () => {});
      await runtime.waitForInitialization();
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('waitForInitialization', () => {
    it('waits for running initializations', async () => {
      const connection = createConnection();
      const init = deferred();
      connection.provider.initialize.mockReturnValue(init.promise);
      registerConnections([connection]);

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
      const connection = createConnection();
      connection.provider.initialize.mockRejectedValue(new Error('Oops'));
      registerConnections([connection]);

      void runtime.onInvoke({ headers }, () => {});
      await expect(runtime.waitForInitialization()).resolves.toBeUndefined();
    });

    it('resolves when nothing is initializing', async () => {
      await expect(runtime.waitForInitialization()).resolves.toBeUndefined();
    });
  });

  describe('onShutdown', () => {
    it('closes initialized providers', async () => {
      const connection = createConnection();
      registerConnections([connection]);

      await runtime.onInit();
      await runtime.onShutdown();
      expect(connection.provider.onClose).toHaveBeenCalledTimes(1);
    });

    it('closes providers which were initialized by an evaluation', async () => {
      const connection = createConnection();
      const flag = defineFlag({ key: 'a', connection });

      await flag();
      await runtime.onShutdown();
      expect(connection.provider.onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close providers which were never initialized', async () => {
      const connection = createConnection();
      registerConnections([connection]);

      await runtime.onShutdown();
      expect(connection.provider.onClose).not.toHaveBeenCalled();
    });

    it('does not close providers whose initialization failed', async () => {
      const connection = createConnection();
      connection.provider.initialize.mockRejectedValueOnce(new Error('Oops'));
      registerConnections([connection]);

      await runtime.onInit();
      await runtime.onShutdown();
      expect(connection.provider.onClose).not.toHaveBeenCalled();
    });

    it('waits for running initializations before closing', async () => {
      const order: string[] = [];
      const connection = createConnection();
      const init = deferred();
      connection.provider.initialize.mockImplementation(async () => {
        await init.promise;
        order.push('initialize');
      });
      connection.provider.onClose.mockImplementation(async () => {
        order.push('close');
      });
      registerConnections([connection]);

      void runtime.onInvoke({ headers }, () => {});
      const shutdown = runtime.onShutdown();
      init.resolve();
      await shutdown;
      expect(order).toEqual(['initialize', 'close']);
    });

    it('logs errors and closes the other providers', async () => {
      const failing = createConnection('failing');
      const error = new Error('Oops');
      failing.provider.onClose.mockRejectedValue(error);
      const working = createConnection('working');
      registerConnections([failing, working]);

      await runtime.onInit();
      await expect(runtime.onShutdown()).resolves.toBeUndefined();
      expect(working.provider.onClose).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not close provider "failing".',
        error,
      );
    });

    it('initializes providers again when used after a shutdown', async () => {
      const connection = createConnection();
      const flag = defineFlag({ key: 'a', connection });

      await runtime.onInit();
      await runtime.onShutdown();
      await flag();
      expect(connection.provider.initialize).toHaveBeenCalledTimes(2);
    });
  });

  describe('evaluate', () => {
    it('evaluates a flag returned by defineFlag', async () => {
      const connection = createConnection();
      const flag = defineFlag({ key: 'a', connection });

      await expect(runtime.evaluate(flag)).resolves.toBe(true);
      expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'a',
        false,
        {},
        console,
      );
      expectTypeOf(flag).toExtend<FlagDefinition>();
      expectTypeOf(runtime.evaluate(flag)).toEqualTypeOf<Promise<boolean>>();
    });

    it('evaluates a key which is only known at runtime', async () => {
      const connection = createConnection();
      const key = ['new', 'checkout'].join('-');

      await expect(
        runtime.evaluate({ key, connection, defaultValue: false }),
      ).resolves.toBe(true);
      expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'new-checkout',
        false,
        {},
        console,
      );
    });

    it('initializes the provider of a connection which is not registered', async () => {
      const connection = createConnection();
      runtime.reset();

      await runtime.evaluate({ key: 'a', connection });
      expect(connection.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('uses the context of the current request', async () => {
      const provider = {
        metadata: { name: 'test' },
        resolveBooleanEvaluation: vi.fn(async () => ({ value: true })),
      } satisfies Provider;
      const connection = defineConnection({
        provider,
        project: { platform: 'in-memory' },
        getEvaluationContext: ({ headers }) => ({
          targetingKey: headers.get('x-user') ?? 'anonymous',
        }),
      });

      await runtime.onInvoke(
        { headers: new Headers({ 'x-user': 'alice' }) },
        () => runtime.evaluate({ key: 'a', connection }),
      );
      expect(provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'a',
        false,
        { targetingKey: 'alice' },
        console,
      );
    });

    it('returns the default value when the evaluation fails', async () => {
      const connection = createConnection();
      connection.provider.resolveBooleanEvaluation.mockRejectedValue(
        new Error('Oops'),
      );

      await expect(
        runtime.evaluate({ key: 'a', connection, defaultValue: false }),
      ).resolves.toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'FlagEvaluationError', flagKey: 'a' }),
      );
    });

    it('rejects with a FlagEvaluationError without a default value', async () => {
      const connection = createConnection();
      connection.provider.resolveBooleanEvaluation.mockRejectedValue(
        new Error('Oops'),
      );

      await expect(
        runtime.evaluate({ key: 'a', connection }),
      ).rejects.toMatchObject({
        name: 'FlagEvaluationError',
        message: 'flags: Could not evaluate flag "a": Oops',
      });
    });

    it('requires a connection returned by defineConnection', async () => {
      const connection = {
        provider: createConnection().provider,
        project: { platform: 'in-memory' as const },
      };

      await expect(runtime.evaluate({ key: 'a', connection })).rejects.toThrow(
        'flags: The connection of flag "a" must be returned by defineConnection.',
      );
    });
  });

  it('supports providers without initialize and onClose', async () => {
    const connection = defineConnection({
      provider: {
        metadata: { name: 'minimal' },
        resolveBooleanEvaluation: async () => ({ value: true }),
      },
      project: { platform: 'in-memory' },
    });
    const flag = defineFlag({ key: 'a', connection });

    await runtime.onInit();
    await runtime.onInvoke({ headers }, () => {});
    await expect(flag()).resolves.toBe(true);
    await runtime.onShutdown();
  });
});

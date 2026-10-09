import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection, type GetEvaluationContext } from './connection';
import { defineFlag } from './flag';
import { registerConnections } from './register';
import { runtime } from './runtime';
import {
  type IncomingRequest,
  type Provider,
  type ProviderExtension,
  providerExtension,
} from './types';

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function createProvider(name = 'test') {
  const extension = {
    onInvoke: vi.fn<(request: IncomingRequest) => Promise<void>>(
      async () => {},
    ),
  } satisfies ProviderExtension;
  const provider = {
    metadata: { name },
    [providerExtension]: extension,
    initialize: vi.fn<() => Promise<void>>(async () => {}),
    resolveBooleanEvaluation: vi.fn(async () => ({ value: true })),
  } satisfies Provider;
  return { provider, extension };
}

function createConnection(
  getEvaluationContext?: GetEvaluationContext,
  name?: string,
) {
  const { provider, extension } = createProvider(name);
  const connection = defineConnection({
    provider,
    project: { platform: 'in-memory' },
    getEvaluationContext,
  });
  return { connection, provider, extension };
}

function request(user: string): IncomingRequest {
  return { headers: new Headers({ 'x-user': user }) };
}

const getUserContext = vi.fn<GetEvaluationContext>(({ headers }) => ({
  targetingKey: headers.get('x-user') ?? 'anonymous',
}));

describe('request scope', () => {
  beforeEach(() => {
    runtime.reset();
    getUserContext.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onInvoke', () => {
    it('returns the result of the handler', async () => {
      await expect(runtime.onInvoke(request('a'), () => 'sync')).resolves.toBe(
        'sync',
      );
      await expect(
        runtime.onInvoke(request('a'), async () => 'async'),
      ).resolves.toBe('async');
    });

    it('rejects with the error of the handler', async () => {
      const error = new Error('Handler failed');

      await expect(
        runtime.onInvoke(request('a'), () => {
          throw error;
        }),
      ).rejects.toBe(error);
    });
  });

  describe('getEvaluationContext', () => {
    it('passes the context to the provider', async () => {
      const { connection, provider } = createConnection(getUserContext);
      const flag = defineFlag({ key: 'a', connection });

      await runtime.onInvoke(request('alice'), () => flag());
      expect(getUserContext).toHaveBeenCalledWith(request('alice'));
      expect(provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'a',
        false,
        { targetingKey: 'alice' },
        console,
      );
    });

    it('is called once per request and connection', async () => {
      const { connection } = createConnection(getUserContext);
      const a = defineFlag({ key: 'a', connection });
      const b = defineFlag({ key: 'b', connection });

      await runtime.onInvoke(request('alice'), async () => {
        await Promise.all([a(), b(), a()]);
        await b();
      });
      expect(getUserContext).toHaveBeenCalledTimes(1);
    });

    it('is called again for the next request', async () => {
      const { connection } = createConnection(getUserContext);
      const flag = defineFlag({ key: 'a', connection });

      await runtime.onInvoke(request('alice'), () => flag());
      await runtime.onInvoke(request('bob'), () => flag());
      expect(getUserContext).toHaveBeenCalledTimes(2);
    });

    it('is not called for requests which do not use the connection', async () => {
      createConnection(getUserContext);

      await runtime.onInvoke(request('alice'), () => {});
      expect(getUserContext).not.toHaveBeenCalled();
    });

    it('keeps concurrent requests apart', async () => {
      const { connection, provider } = createConnection(getUserContext);
      const flag = defineFlag({ key: 'a', connection });
      const gate = deferred();

      await Promise.all([
        runtime.onInvoke(request('alice'), async () => {
          await gate.promise;
          return flag();
        }),
        runtime.onInvoke(request('bob'), async () => {
          const value = await flag();
          gate.resolve();
          return value;
        }),
      ]);

      const contexts = provider.resolveBooleanEvaluation.mock.calls.map(
        (call) => (call as unknown[])[2],
      );
      expect(contexts).toEqual([
        { targetingKey: 'bob' },
        { targetingKey: 'alice' },
      ]);
    });

    it('creates a context for each connection of a shared provider', async () => {
      const { connection: a, provider } = createConnection(() => ({
        targetingKey: 'a',
      }));
      const b = defineConnection({
        provider,
        project: { platform: 'launchdarkly', projectId: 'x', teamId: 'y' },
        getEvaluationContext: () => ({ targetingKey: 'b' }),
      });
      const flagA = defineFlag({ key: 'a', connection: a });
      const flagB = defineFlag({ key: 'b', connection: b });

      await runtime.onInvoke(request('alice'), async () => {
        await flagA();
        await flagB();
      });
      expect(provider.resolveBooleanEvaluation).toHaveBeenNthCalledWith(
        1,
        'a',
        false,
        { targetingKey: 'a' },
        console,
      );
      expect(provider.resolveBooleanEvaluation).toHaveBeenNthCalledWith(
        2,
        'b',
        false,
        { targetingKey: 'b' },
        console,
      );
    });

    it('can be async', async () => {
      const { connection, provider } = createConnection(async () => ({
        targetingKey: 'async',
      }));
      const flag = defineFlag({ key: 'a', connection });

      await runtime.onInvoke(request('alice'), () => flag());
      expect(provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'a',
        false,
        { targetingKey: 'async' },
        console,
      );
    });

    it('uses an empty context without getEvaluationContext', async () => {
      const { connection, provider } = createConnection();
      const flag = defineFlag({ key: 'a', connection });

      await runtime.onInvoke(request('alice'), () => flag());
      expect(provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'a',
        false,
        {},
        console,
      );
    });

    it('is not called outside of a request', async () => {
      const { connection, provider } = createConnection(getUserContext);
      const flag = defineFlag({ key: 'a', connection });

      await flag();
      expect(getUserContext).not.toHaveBeenCalled();
      expect(provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'a',
        false,
        {},
        console,
      );
    });

    describe('when it throws', () => {
      let calls = 0;
      const failing: GetEvaluationContext = () => {
        calls++;
        throw new Error('No user');
      };

      beforeEach(() => {
        calls = 0;
      });

      it('throws without a default value', async () => {
        const { connection, provider } = createConnection(failing);
        const flag = defineFlag({ key: 'a', connection });

        await expect(
          runtime.onInvoke(request('alice'), () => flag()),
        ).rejects.toMatchObject({
          name: 'FlagEvaluationError',
          message: 'flags: Could not evaluate flag "a": No user',
        });
        expect(provider.resolveBooleanEvaluation).not.toHaveBeenCalled();
      });

      it('returns the default value and logs the error', async () => {
        const { connection } = createConnection(failing);
        const flag = defineFlag({ key: 'a', defaultValue: false, connection });

        await expect(
          runtime.onInvoke(request('alice'), () => flag()),
        ).resolves.toBe(false);
        expect(console.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'flags: Could not evaluate flag "a": No user',
          }),
        );
      });

      it('is not called again in the same request', async () => {
        const { connection } = createConnection(failing);
        const flag = defineFlag({ key: 'a', defaultValue: false, connection });

        await runtime.onInvoke(request('alice'), async () => {
          await flag();
          await flag();
        });
        expect(calls).toBe(1);
      });
    });
  });

  describe('onInvoke extension', () => {
    it('is called once per request for registered providers', async () => {
      const { connection, extension } = createConnection();
      registerConnections([connection]);

      await runtime.onInvoke(request('alice'), () => {});
      await runtime.waitForInitialization();
      await vi.waitFor(() =>
        expect(extension.onInvoke).toHaveBeenCalledWith(request('alice')),
      );

      await runtime.onInvoke(request('bob'), () => {});
      await vi.waitFor(() =>
        expect(extension.onInvoke).toHaveBeenCalledTimes(2),
      );
    });

    it('is called after the initialization', async () => {
      const order: string[] = [];
      const { connection, provider, extension } = createConnection();
      const init = deferred();
      provider.initialize.mockImplementation(async () => {
        await init.promise;
        order.push('initialize');
      });
      extension.onInvoke.mockImplementation(async () => {
        order.push('onInvoke');
      });
      const flag = defineFlag({ key: 'a', connection });

      await runtime.onInvoke(request('alice'), async () => {
        const pending = flag();
        init.resolve();
        await pending;
      });
      expect(order).toEqual(['initialize', 'onInvoke']);
    });

    it('does not delay the handler', async () => {
      const { connection, extension } = createConnection();
      extension.onInvoke.mockReturnValue(deferred().promise);
      registerConnections([connection]);

      await expect(
        runtime.onInvoke(request('alice'), () => 'result'),
      ).resolves.toBe('result');
    });

    it('lets flags of the provider wait for it', async () => {
      const { connection, provider, extension } = createConnection();
      const prepared = deferred();
      extension.onInvoke.mockReturnValue(prepared.promise);
      const flag = defineFlag({ key: 'a', connection });

      await runtime.onInvoke(request('alice'), async () => {
        const pending = flag();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(provider.resolveBooleanEvaluation).not.toHaveBeenCalled();

        prepared.resolve();
        await expect(pending).resolves.toBe(true);
      });
    });

    it('does not let flags of other providers wait for it', async () => {
      const slow = createConnection(undefined, 'slow');
      slow.extension.onInvoke.mockReturnValue(deferred().promise);
      const fast = createConnection(undefined, 'fast');
      defineFlag({ key: 'a', connection: slow.connection });
      const fastFlag = defineFlag({ key: 'b', connection: fast.connection });

      await runtime.onInvoke(request('alice'), async () => {
        await expect(fastFlag()).resolves.toBe(true);
      });
    });

    it('is called once per request for providers of flags which are not registered', async () => {
      const { connection, extension } = createConnection();
      const flag = defineFlag({ key: 'a', connection });
      runtime.reset();

      await runtime.onInvoke(request('alice'), async () => {
        expect(extension.onInvoke).not.toHaveBeenCalled();
        await flag();
        await flag();
      });
      expect(extension.onInvoke).toHaveBeenCalledTimes(1);
    });

    it('logs errors and lets the evaluation continue', async () => {
      const { connection, extension } = createConnection(undefined, 'broken');
      const error = new Error('Refresh failed');
      extension.onInvoke.mockRejectedValue(error);
      const flag = defineFlag({ key: 'a', connection });

      await expect(
        runtime.onInvoke(request('alice'), () => flag()),
      ).resolves.toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        'flags: The onInvoke extension of provider "broken" failed.',
        error,
      );
    });

    it('is not called outside of a request', async () => {
      const { connection, extension } = createConnection();
      const flag = defineFlag({ key: 'a', connection });

      await flag();
      expect(extension.onInvoke).not.toHaveBeenCalled();
    });

    it('is not called when the initialization fails', async () => {
      const { connection, provider, extension } = createConnection();
      provider.initialize.mockRejectedValueOnce(new Error('Network error'));
      const flag = defineFlag({ key: 'a', defaultValue: false, connection });

      await runtime.onInvoke(request('alice'), () => flag());
      expect(extension.onInvoke).not.toHaveBeenCalled();

      await runtime.onInvoke(request('bob'), () => flag());
      expect(extension.onInvoke).toHaveBeenCalledTimes(1);
    });
  });
});

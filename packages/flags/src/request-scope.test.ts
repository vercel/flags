import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection, type GetEvaluationContext } from './connection';
import { defineFlag } from './flag';
import { logger } from './logger';
import { runtime } from './runtime';
import type { FlagsRequest, FlagsRequestInit, Provider } from './types';

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function createProvider(name = 'test') {
  return {
    metadata: { name },
    initialize: vi.fn<() => Promise<void>>(async () => {}),
    resolveBooleanEvaluation: vi.fn(async () => ({ value: true })),
  } satisfies Provider;
}

function createConnection(
  getEvaluationContext?: GetEvaluationContext,
  name?: string,
) {
  const provider = createProvider(name);
  const connection = defineConnection({
    provider,
    project: { platform: 'in-memory' },
    getEvaluationContext,
  });
  return { connection, provider };
}

function request(user: string): FlagsRequestInit {
  return { headers: new Headers({ 'x-user': user }) };
}

const getUserContext = vi.fn<GetEvaluationContext>((_context, request) => ({
  targetingKey: request?.headers?.get('x-user') ?? 'anonymous',
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

    it('keeps the scope for work which next starts', async () => {
      const { connection, provider } = createConnection(getUserContext);
      const flag = defineFlag({ key: 'a', connection });

      // Like Express: next returns at once, the work continues later
      const evaluation = await new Promise<Promise<boolean>>((resolve) => {
        void runtime.onInvoke(request('alice'), () => {
          setTimeout(() => resolve(flag()), 0);
        });
      });

      await evaluation;
      expect(provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'a',
        false,
        { targetingKey: 'alice' },
        logger,
      );
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

  describe('requests of frameworks', () => {
    async function receivedRequest(init: FlagsRequestInit) {
      let received: FlagsRequest | undefined;
      const { connection } = createConnection((_context, incoming) => {
        received = incoming;
        return {};
      });
      const flag = defineFlag({ key: 'a', connection });
      await runtime.onInvoke(init, () => flag());
      return received;
    }

    it('gives the steps a standard request made from a Web Request', async () => {
      const original = new Request('https://example.com/teams/acme', {
        headers: { 'x-user': 'alice', cookie: 'theme=dark' },
      });
      const received = await receivedRequest(original);

      expect(received?.headers).toBe(original.headers);
      expect(received?.url?.pathname).toBe('/teams/acme');
      expect(received?.cookies?.get('theme')?.value).toBe('dark');
    });

    it('gives the steps a standard request made from headers and cookies', async () => {
      // Like Next.js: headers() and cookies(), but no URL
      const headers = new Headers({ 'x-user': 'alice' });
      const cookies = {
        get: (name: string) => ({ name, value: 'from-next' }),
        getAll: () => [],
        has: () => true,
      };
      const received = await receivedRequest({ headers, cookies });

      expect(received?.headers).toBe(headers);
      expect(received?.cookies).toBe(cookies);
      expect(received?.url).toBeUndefined();
    });

    it('gives the steps an empty standard request without any property', async () => {
      const received = await receivedRequest({});

      expect(received).toBeDefined();
      expect(received?.headers).toBeUndefined();
      expect(received?.cookies).toBeUndefined();
      expect(received?.url).toBeUndefined();
    });
  });

  describe('request source', () => {
    afterEach(() => {
      runtime.setRequestSource(undefined);
    });

    it('gives the request of the source to the steps', async () => {
      const current = { headers: new Headers({ 'x-user': 'alice' }) };
      runtime.setRequestSource(() => current);
      const { connection, provider } = createConnection(getUserContext);
      const flag = defineFlag({ key: 'a', connection });

      await flag();
      expect(getUserContext).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ headers: current.headers }),
      );
      expect(provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'a',
        false,
        { targetingKey: 'alice' },
        logger,
      );
    });

    it('accepts an async source', async () => {
      const current = { headers: new Headers({ 'x-user': 'bob' }) };
      runtime.setRequestSource(async () => current);
      const { connection } = createConnection(getUserContext);

      await defineFlag({ key: 'a', connection })();
      expect(getUserContext).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ headers: current.headers }),
      );
    });

    it('caches the steps for the same request object', async () => {
      const current = { headers: new Headers({ 'x-user': 'alice' }) };
      runtime.setRequestSource(() => current);
      const { connection } = createConnection(getUserContext);
      const a = defineFlag({ key: 'a', connection });
      const b = defineFlag({ key: 'b', connection });

      await a();
      await b();
      expect(getUserContext).toHaveBeenCalledTimes(1);
    });

    it('identifies a request by its headers object', async () => {
      // Like Next.js: a new object on each call, but the same headers
      const headers = new Headers({ 'x-user': 'alice' });
      runtime.setRequestSource(() => ({ headers }));
      const { connection } = createConnection(getUserContext);
      const a = defineFlag({ key: 'a', connection });
      const b = defineFlag({ key: 'b', connection });

      await a();
      await b();
      expect(getUserContext).toHaveBeenCalledTimes(1);
    });

    it('identifies a request without headers by the object', async () => {
      let init: FlagsRequestInit = { url: 'https://example.com/a' };
      runtime.setRequestSource(() => init);
      const step = vi.fn(() => ({}));
      const { connection } = createConnection(step);
      const flag = defineFlag({ key: 'a', connection });

      await flag();
      await flag();
      expect(step).toHaveBeenCalledTimes(1);

      init = { url: 'https://example.com/b' };
      await flag();
      expect(step).toHaveBeenCalledTimes(2);
    });

    it('runs the steps again for new headers', async () => {
      let current = { headers: new Headers({ 'x-user': 'alice' }) };
      runtime.setRequestSource(() => current);
      const { connection } = createConnection(getUserContext);
      const flag = defineFlag({ key: 'a', connection });

      await flag();
      current = { headers: new Headers({ 'x-user': 'bob' }) };
      await flag();
      expect(getUserContext).toHaveBeenCalledTimes(2);
    });

    it('gives no request when the source returns undefined', async () => {
      runtime.setRequestSource(() => undefined);
      const { connection } = createConnection(getUserContext);

      await defineFlag({ key: 'a', connection })();
      expect(getUserContext).toHaveBeenCalledWith(undefined, undefined);
    });

    it('is not used inside onInvoke', async () => {
      const source = vi.fn(() => ({ headers: new Headers() }));
      runtime.setRequestSource(source);
      const { connection } = createConnection(getUserContext);
      const flag = defineFlag({ key: 'a', connection });

      await runtime.onInvoke(request('alice'), () => flag());
      expect(source).not.toHaveBeenCalled();
    });

    it('fails the evaluation when the source throws', async () => {
      runtime.setRequestSource(() => {
        throw new Error('No request');
      });
      const { connection } = createConnection(getUserContext);
      const flag = defineFlag({ key: 'a', connection });

      await expect(flag()).rejects.toMatchObject({
        message: 'flags: Could not evaluate flag "a": No request',
      });
    });
  });

  describe('getEvaluationContext', () => {
    it('passes the context to the provider', async () => {
      const { connection, provider } = createConnection(getUserContext);
      const flag = defineFlag({ key: 'a', connection });

      await runtime.onInvoke(request('alice'), () => flag());
      expect(getUserContext).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ headers: expect.any(Headers) }),
      );
      expect(provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'a',
        false,
        { targetingKey: 'alice' },
        logger,
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
        logger,
      );
      expect(provider.resolveBooleanEvaluation).toHaveBeenNthCalledWith(
        2,
        'b',
        false,
        { targetingKey: 'b' },
        logger,
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
        logger,
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
        logger,
      );
    });

    it('is called without a request outside of a request', async () => {
      const { connection, provider } = createConnection(getUserContext);
      const flag = defineFlag({ key: 'a', connection });

      await flag();
      expect(getUserContext).toHaveBeenCalledWith(undefined, undefined);
      expect(provider.resolveBooleanEvaluation).toHaveBeenCalledWith(
        'a',
        false,
        { targetingKey: 'anonymous' },
        logger,
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
          'flags: Could not evaluate flag "a": No user. Returned the default value: false.',
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
});

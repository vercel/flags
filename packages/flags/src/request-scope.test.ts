import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection, type GetEvaluationContext } from './connection';
import { defineFlag } from './flag';
import { runtime } from './runtime';
import type { IncomingRequest, Provider, RequestLike } from './types';

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
        console,
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
    async function headersFor(request: RequestLike) {
      let received: IncomingRequest | undefined;
      const { connection } = createConnection((incoming) => {
        received = incoming;
        return {};
      });
      const flag = defineFlag({ key: 'a', connection });
      await runtime.onInvoke(request, () => flag());
      return received?.headers;
    }

    it('accepts a Web Request', async () => {
      const headers = await headersFor(
        new Request('https://example.com', { headers: { 'x-user': 'alice' } }),
      );
      expect(headers?.get('x-user')).toBe('alice');
    });

    it('accepts Node.js headers', async () => {
      const headers = await headersFor({
        headers: {
          'x-user': 'alice',
          'accept-language': ['en', 'de'],
          'x-missing': undefined,
          ':path': '/',
        },
      });

      expect(headers?.get('x-user')).toBe('alice');
      expect(headers?.get('accept-language')).toBe('en, de');
      expect(headers?.has('x-missing')).toBe(false);
      expect([...(headers?.keys() ?? [])]).not.toContain(':path');
    });

    it('passes Web Headers through', async () => {
      const original = new Headers({ 'x-user': 'alice' });
      expect(await headersFor({ headers: original })).toBe(original);
    });

    it('does not read the headers when no connection needs them', async () => {
      const { connection } = createConnection();
      const flag = defineFlag({ key: 'a', connection });
      const request = {
        get headers(): Headers {
          throw new Error('Headers were read');
        },
      };

      await expect(runtime.onInvoke(request, () => flag())).resolves.toBe(true);
    });
  });

  describe('getEvaluationContext', () => {
    it('passes the context to the provider', async () => {
      const { connection, provider } = createConnection(getUserContext);
      const flag = defineFlag({ key: 'a', connection });

      await runtime.onInvoke(request('alice'), () => flag());
      expect(getUserContext).toHaveBeenCalledWith({
        headers: expect.any(Headers),
      });
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
});

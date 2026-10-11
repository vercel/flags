import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection } from './connection';
import { evaluate } from './evaluate';
import { defineFlag } from './flag';
import { runtime } from './runtime';
import type { Provider } from './types';

function createConnection() {
  let calls = 0;
  const provider = {
    metadata: { name: 'counting' },
    // Each evaluation returns a new value, so a second evaluation is visible
    resolveBooleanEvaluation: vi.fn(async () => ({ value: ++calls % 2 === 1 })),
  } satisfies Provider;
  return defineConnection({
    provider,
    project: { system: 'in-memory' },
  });
}

const request = () => new Request('https://shop.example');

beforeEach(() => {
  runtime.reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the cache of each request', () => {
  it('evaluates a flag once per request', async () => {
    const connection = createConnection();
    const flag = defineFlag({ key: 'a', connection });

    const values = await runtime.onInvoke(request(), async () => [
      await flag(),
      await flag(),
      await evaluate(flag),
    ]);
    expect(values).toEqual([true, true, true]);
    expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(
      1,
    );
  });

  it('shares one evaluation between concurrent calls', async () => {
    const connection = createConnection();
    const flag = defineFlag({ key: 'a', connection });

    await runtime.onInvoke(request(), () =>
      Promise.all([flag(), flag(), evaluate([flag, flag])]),
    );
    expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(
      1,
    );
  });

  it('evaluates again in a new request', async () => {
    const connection = createConnection();
    const flag = defineFlag({ key: 'a', connection });

    expect(await runtime.onInvoke(request(), () => flag())).toBe(true);
    expect(await runtime.onInvoke(request(), () => flag())).toBe(false);
  });

  it('evaluates on each call outside of a request', async () => {
    const connection = createConnection();
    const flag = defineFlag({ key: 'a', connection });

    expect(await flag()).toBe(true);
    expect(await flag()).toBe(false);
  });

  it('compares plain data of the call side by its content', async () => {
    const connection = createConnection();
    const flag = defineFlag({ key: 'a', connection });

    await runtime.onInvoke(request(), async () => {
      // e.g. two server components, which each create the object
      await flag({ evaluationContext: { user: 'alice', plan: 'pro' } });
      await flag({ evaluationContext: { plan: 'pro', user: 'alice' } });
      await flag({ evaluationContext: { user: 'bob', plan: 'pro' } });
    });
    expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(
      2,
    );
  });

  it('compares other objects by identity', async () => {
    const connection = createConnection();
    const flag = defineFlag({ key: 'a', connection });
    const date = new Date(0);

    await runtime.onInvoke(request(), async () => {
      await flag({ evaluationContext: { since: date } });
      await flag({ evaluationContext: { since: date } });
      const same = { since: date };
      await flag({ evaluationContext: same });
      await flag({ evaluationContext: same });
    });
    // A Date is not plain data, so each new object is a new input
    expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(
      3,
    );
  });

  it('does not fail for a circular input', async () => {
    const connection = createConnection();
    const flag = defineFlag({ key: 'a', connection });
    const circular: Record<string, unknown> = { user: 'alice' };
    circular.self = circular;

    await runtime.onInvoke(request(), async () => {
      await flag({ evaluationContext: circular as never });
      await flag({ evaluationContext: circular as never });
    });
    expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(
      1,
    );
  });

  it('keeps one result for each flag object', async () => {
    const connection = createConnection();
    const a = defineFlag({ key: 'a', connection });
    const b = defineFlag({ key: 'a', connection });

    await runtime.onInvoke(request(), () => evaluate([a, b]));
    expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(
      2,
    );
  });

  it('works with a request source, e.g. in Next.js', async () => {
    const connection = createConnection();
    const flag = defineFlag({ key: 'a', connection });
    const headers = new Headers();
    // Next.js returns a new object on each call, but the same headers
    runtime.setRequestSource(() => ({ headers }));

    await flag();
    await flag();
    expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(
      1,
    );
  });

  it('keeps a failure, and logs it once per request', async () => {
    const provider: Provider = {
      metadata: { name: 'failing' },
      resolveBooleanEvaluation: vi.fn(async () => {
        throw new Error('Offline');
      }),
    };
    const connection = defineConnection({
      provider,
      project: { system: 'in-memory' },
    });
    const withDefault = defineFlag({
      key: 'a',
      connection,
      defaultValue: false,
    });
    const withoutDefault = defineFlag({ key: 'b', connection });

    await runtime.onInvoke(request(), async () => {
      expect(await withDefault()).toBe(false);
      expect(await withDefault()).toBe(false);
      await expect(withoutDefault()).rejects.toThrow('Offline');
      await expect(withoutDefault()).rejects.toThrow('Offline');
    });
    expect(provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('runs the hooks only for the evaluation, not for a result of the cache', async () => {
    const after = vi.fn();
    const connection = createConnection();
    runtime.configure({ hooks: [{ after }] });
    const flag = defineFlag({ key: 'a', connection });

    await runtime.onInvoke(request(), async () => {
      await flag();
      await flag();
    });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('gives a call with its own hooks its own evaluation', async () => {
    const after = vi.fn();
    const connection = createConnection();
    const flag = defineFlag({ key: 'a', connection });

    await runtime.onInvoke(request(), async () => {
      await flag();
      await flag({ hooks: [{ after }] });
      await flag({ hookHints: { debug: true } });
    });
    expect(after).toHaveBeenCalledTimes(1);
    expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(
      3,
    );
  });
});

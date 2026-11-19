import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate } from './evaluate';
import { bindFlag } from './flag';
import { runtime } from './runtime';
import { defineSource } from './source';
import type { Provider } from './types';

function createSource() {
  let calls = 0;
  const provider = {
    metadata: { name: 'counting' },
    // Each evaluation returns a new value, so a second evaluation is visible
    resolveBooleanEvaluation: vi.fn(async () => ({ value: ++calls % 2 === 1 })),
  } satisfies Provider;
  return defineSource({
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
    const source = createSource();
    const flag = bindFlag({ key: 'a', source });

    const values = await runtime.onInvoke(request(), async () => [
      await flag(),
      await flag(),
      await evaluate(flag),
    ]);
    expect(values).toEqual([true, true, true]);
    expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(1);
  });

  it('shares one evaluation between concurrent calls', async () => {
    const source = createSource();
    const flag = bindFlag({ key: 'a', source });

    await runtime.onInvoke(request(), () =>
      Promise.all([flag(), flag(), evaluate([flag, flag])]),
    );
    expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(1);
  });

  it('evaluates again in a new request', async () => {
    const source = createSource();
    const flag = bindFlag({ key: 'a', source });

    expect(await runtime.onInvoke(request(), () => flag())).toBe(true);
    expect(await runtime.onInvoke(request(), () => flag())).toBe(false);
  });

  it('evaluates on each call outside of a request', async () => {
    const source = createSource();
    const flag = bindFlag({ key: 'a', source });

    expect(await flag()).toBe(true);
    expect(await flag()).toBe(false);
  });

  it('compares plain data of the call side by its content', async () => {
    const source = createSource();
    const flag = bindFlag({ key: 'a', source });

    await runtime.onInvoke(request(), async () => {
      // e.g. two server components, which each create the object
      await flag({ evaluationContext: { user: 'alice', plan: 'pro' } });
      await flag({ evaluationContext: { plan: 'pro', user: 'alice' } });
      await flag({ evaluationContext: { user: 'bob', plan: 'pro' } });
    });
    expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(2);
  });

  it('compares other objects by identity', async () => {
    const source = createSource();
    const flag = bindFlag({ key: 'a', source });
    const date = new Date(0);

    await runtime.onInvoke(request(), async () => {
      await flag({ evaluationContext: { since: date } });
      await flag({ evaluationContext: { since: date } });
      const same = { since: date };
      await flag({ evaluationContext: same });
      await flag({ evaluationContext: same });
    });
    // A Date is not plain data, so each new object is a new input
    expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(3);
  });

  it('does not fail for a circular input', async () => {
    const source = createSource();
    const flag = bindFlag({ key: 'a', source });
    const circular: Record<string, unknown> = { user: 'alice' };
    circular.self = circular;

    await runtime.onInvoke(request(), async () => {
      await flag({ evaluationContext: circular as never });
      await flag({ evaluationContext: circular as never });
    });
    expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(1);
  });

  it('keeps one result for each flag object', async () => {
    const source = createSource();
    const a = bindFlag({ key: 'a', source });
    const b = bindFlag({ key: 'a', source });

    await runtime.onInvoke(request(), () => evaluate([a, b]));
    expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(2);
  });

  it('works with a request getter, e.g. in Next.js', async () => {
    const source = createSource();
    const flag = bindFlag({ key: 'a', source });
    const headers = new Headers();
    // Next.js returns a new object on each call, but the same headers
    runtime.setGetRequest(() => ({ headers }));

    await flag();
    await flag();
    expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(1);
  });

  it('keeps a failure, and logs it once per request', async () => {
    const provider: Provider = {
      metadata: { name: 'failing' },
      resolveBooleanEvaluation: vi.fn(async () => {
        throw new Error('Offline');
      }),
    };
    const source = defineSource({
      provider,
      project: { system: 'in-memory' },
    });
    const withDefault = bindFlag({
      key: 'a',
      source,
      defaultValue: false,
    });
    const withoutDefault = bindFlag({ key: 'b', source });

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
    const source = createSource();
    runtime.configure({ hooks: [{ after }] });
    const flag = bindFlag({ key: 'a', source });

    await runtime.onInvoke(request(), async () => {
      await flag();
      await flag();
    });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('gives a call with its own hooks its own evaluation', async () => {
    const after = vi.fn();
    const source = createSource();
    const flag = bindFlag({ key: 'a', source });

    await runtime.onInvoke(request(), async () => {
      await flag();
      await flag({ hooks: [{ after }] });
      await flag({ hookHints: { debug: true } });
    });
    expect(after).toHaveBeenCalledTimes(1);
    expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(3);
  });
});

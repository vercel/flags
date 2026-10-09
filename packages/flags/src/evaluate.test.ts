import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { defineConnection, type GetEvaluationContext } from './connection';
import { type EvaluateContext, evaluate } from './evaluate';
import { defineFlag } from './flag';
import { runtime } from './runtime';
import type { EvaluationContext, Provider } from './types';

function createProvider(values: Record<string, boolean> = {}) {
  return {
    metadata: { name: 'test' },
    initialize: vi.fn<() => Promise<void>>(async () => {}),
    resolveBooleanEvaluation: vi.fn(async (key: string) => {
      if (!(key in values)) throw new Error(`Unknown flag "${key}"`);
      return { value: values[key] as boolean };
    }),
  } satisfies Provider;
}

function createConnection<C extends EvaluationContext = EvaluationContext>(
  values: Record<string, boolean>,
  getEvaluationContext?: GetEvaluationContext<C>,
) {
  const provider = createProvider(values);
  const connection = defineConnection({
    provider,
    project: { platform: 'in-memory' },
    getEvaluationContext,
  });
  return { connection, provider };
}

function contextOf(provider: ReturnType<typeof createProvider>, call = 0) {
  return (provider.resolveBooleanEvaluation.mock.calls[call] as unknown[])[2];
}

const request = { headers: new Headers({ 'x-user': 'alice' }) };

describe('evaluate', () => {
  beforeEach(() => {
    runtime.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('evaluates one flag', async () => {
    const { connection } = createConnection({ a: true });
    const a = defineFlag({ key: 'a', connection });

    const value = await evaluate(a);
    expect(value).toBe(true);
    expectTypeOf(value).toEqualTypeOf<boolean>();
  });

  it('evaluates several flags in the order of the list', async () => {
    const { connection } = createConnection({ a: true, b: false, c: true });
    const a = defineFlag({ key: 'a', connection });
    const b = defineFlag({ key: 'b', connection });
    const c = defineFlag({ key: 'c', connection });

    const values = await evaluate([b, a, c]);
    expect(values).toEqual([false, true, true]);
    expectTypeOf(values).toEqualTypeOf<[boolean, boolean, boolean]>();
  });

  it('evaluates flags of several connections', async () => {
    const first = createConnection({ a: true });
    const second = createConnection({ b: false });
    const a = defineFlag({ key: 'a', connection: first.connection });
    const b = defineFlag({ key: 'b', connection: second.connection });

    await expect(evaluate([a, b])).resolves.toEqual([true, false]);
  });

  it('accepts flag definitions', async () => {
    const { connection } = createConnection({ dynamic: true });

    await expect(evaluate([{ key: 'dynamic', connection }])).resolves.toEqual([
      true,
    ]);
  });

  it('returns an empty list for no flags', async () => {
    await expect(evaluate([])).resolves.toEqual([]);
  });

  it('is the same as runtime.evaluate', async () => {
    const { connection } = createConnection({ a: true });
    const a = defineFlag({ key: 'a', connection });

    await expect(runtime.evaluate([a])).resolves.toEqual([true]);
  });

  describe('when a flag fails', () => {
    it('returns the default value of that flag', async () => {
      const { connection } = createConnection({ a: true });
      const a = defineFlag({ key: 'a', connection });
      const missing = defineFlag({
        key: 'missing',
        defaultValue: false,
        connection,
      });

      await expect(evaluate([a, missing])).resolves.toEqual([true, false]);
      expect(console.error).toHaveBeenCalledWith(
        expect.objectContaining({ flagKey: 'missing' }),
      );
    });

    it('rejects without a default value', async () => {
      const { connection } = createConnection({ a: true });
      const a = defineFlag({ key: 'a', connection });
      const missing = defineFlag({ key: 'missing', connection });

      await expect(evaluate([a, missing])).rejects.toMatchObject({
        name: 'FlagEvaluationError',
        flagKey: 'missing',
      });
    });

    it('rejects for a connection not returned by defineConnection', async () => {
      const { provider } = createConnection({});
      const connection = {
        provider,
        project: { platform: 'in-memory' as const },
      };

      await expect(evaluate([{ key: 'a', connection }])).rejects.toThrow(
        'flags: The connection of flag "a" must be returned by defineConnection.',
      );
    });
  });

  describe('context', () => {
    it('merges the explicit context over the request context', async () => {
      const { connection, provider } = createConnection(
        { a: true },
        ({ headers }) => ({
          targetingKey: headers.get('x-user') ?? 'anonymous',
          country: 'CH',
          plan: 'free',
        }),
      );
      const a = defineFlag({ key: 'a', connection });

      await runtime.onInvoke(request, () =>
        evaluate([a], { country: 'DE', plan: 'pro' }),
      );
      expect(contextOf(provider)).toEqual({
        targetingKey: 'alice',
        country: 'DE',
        plan: 'pro',
      });
    });

    it('uses only the explicit context outside of a request', async () => {
      const { connection, provider } = createConnection({ a: true }, () => ({
        country: 'CH',
      }));
      const a = defineFlag({ key: 'a', connection });

      await evaluate(a, { country: 'DE' });
      expect(contextOf(provider)).toEqual({ country: 'DE' });
    });

    it('ignores fields which are undefined', async () => {
      const { connection, provider } = createConnection({ a: true }, () => ({
        country: 'CH',
      }));
      const a = defineFlag({ key: 'a', connection });

      await runtime.onInvoke(request, () =>
        evaluate(a, { country: undefined }),
      );
      expect(contextOf(provider)).toEqual({ country: 'CH' });
    });

    it('does not change the request context of later evaluations', async () => {
      const getContext = vi.fn(() => ({ country: 'CH' }));
      const { connection, provider } = createConnection(
        { a: true },
        getContext,
      );
      const a = defineFlag({ key: 'a', connection });

      await runtime.onInvoke(request, async () => {
        await evaluate(a, { country: 'DE' });
        await a();
      });
      expect(contextOf(provider, 0)).toEqual({ country: 'DE' });
      expect(contextOf(provider, 1)).toEqual({ country: 'CH' });
      expect(getContext).toHaveBeenCalledTimes(1);
    });

    it('applies the explicit context to the flags of all connections', async () => {
      const first = createConnection({ a: true }, () => ({ team: 't1' }));
      const second = createConnection({ b: true }, () => ({ region: 'eu' }));
      const a = defineFlag({ key: 'a', connection: first.connection });
      const b = defineFlag({ key: 'b', connection: second.connection });

      await runtime.onInvoke(request, () => evaluate([a, b], { region: 'us' }));
      expect(contextOf(first.provider)).toEqual({ team: 't1', region: 'us' });
      expect(contextOf(second.provider)).toEqual({ region: 'us' });
    });
  });

  describe('context types', () => {
    const user = createConnection({ a: true }, () => ({
      user: { id: 'u1', plan: 'pro' as 'free' | 'pro' },
    }));
    const team = createConnection({ b: true }, () => ({
      team: { id: 't1' },
    }));
    const untyped = createConnection({ c: true });
    const a = defineFlag({ key: 'a', connection: user.connection });
    const b = defineFlag({ key: 'b', connection: team.connection });
    const c = defineFlag({ key: 'c', connection: untyped.connection });

    it('takes the shape from getEvaluationContext', () => {
      expectTypeOf<EvaluateContext<[typeof a]>>().toEqualTypeOf<
        Partial<{ user: { id: string; plan: 'free' | 'pro' } }>
      >();

      void (() => {
        evaluate(a, { user: { id: 'u2', plan: 'free' } });
        // @ts-expect-error the connection does not define "targetingKey"
        evaluate(a, { targetingKey: 'u2' });
        // @ts-expect-error the connection does not define "plan"
        evaluate(a, { plan: 'pro' });
        // @ts-expect-error plan must be "free" or "pro"
        evaluate(a, { user: { id: 'u2', plan: 'enterprise' } });
        // @ts-expect-error id must be a string
        evaluate([a], { user: { id: 1, plan: 'pro' } });
      });
    });

    it('accepts the fields of all connections of the flags', () => {
      void (() => {
        evaluate([a, b], {
          user: { id: 'u2', plan: 'pro' },
          team: { id: 't2' },
        });
        evaluate([a, b], { team: { id: 't2' } });
        // @ts-expect-error the id of the team must be a string
        evaluate([a, b], { team: { id: 2 } });
      });
    });

    it('requires a value which is valid for every connection', () => {
      const other = createConnection({ d: true }, () => ({
        user: { id: 1 },
      }));
      const d = defineFlag({ key: 'd', connection: other.connection });

      void (() => {
        // @ts-expect-error "user.id" can not be a string and a number
        evaluate([a, d], { user: { id: 'u2', plan: 'pro' } });
      });
    });

    it('accepts any context for connections without a typed context', () => {
      void (() => {
        evaluate(c, { anything: 'goes', nested: { value: 1 } });
        evaluate([a, c], { user: { id: 'u2', plan: 'pro' }, other: true });
      });
    });
  });
});

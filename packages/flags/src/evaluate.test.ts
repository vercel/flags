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
import { evaluate } from './evaluate';
import { defineFlag } from './flag';
import { runtime } from './runtime';
import type { Provider } from './types';

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

function createConnection(values: Record<string, boolean>) {
  const provider = createProvider(values);
  const connection = defineConnection({
    provider,
    project: { system: 'in-memory' },
  });
  return { connection, provider };
}

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
        'flags: Could not evaluate flag "missing": Unknown flag "missing". Returned the default value: false.',
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
        project: { system: 'in-memory' as const },
      };

      await expect(evaluate([{ key: 'a', connection }])).rejects.toThrow(
        'flags: The connection of flag "a" must be returned by defineConnection.',
      );
    });
  });
});

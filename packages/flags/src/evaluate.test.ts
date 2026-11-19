import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { evaluate } from './evaluate';
import { defineFlag } from './flag';
import { runtime } from './runtime';
import { defineSource } from './source';
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

function createSource(values: Record<string, boolean>) {
  const provider = createProvider(values);
  const source = defineSource({
    provider,
    project: { system: 'in-memory' },
  });
  return { source, provider };
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
    const { source } = createSource({ a: true });
    const a = defineFlag({ key: 'a', source });

    const value = await evaluate(a);
    expect(value).toBe(true);
    expectTypeOf(value).toEqualTypeOf<boolean>();
  });

  it('evaluates several flags in the order of the list', async () => {
    const { source } = createSource({ a: true, b: false, c: true });
    const a = defineFlag({ key: 'a', source });
    const b = defineFlag({ key: 'b', source });
    const c = defineFlag({ key: 'c', source });

    const values = await evaluate([b, a, c]);
    expect(values).toEqual([false, true, true]);
    expectTypeOf(values).toEqualTypeOf<[boolean, boolean, boolean]>();
  });

  it('evaluates flags of several sources', async () => {
    const first = createSource({ a: true });
    const second = createSource({ b: false });
    const a = defineFlag({ key: 'a', source: first.source });
    const b = defineFlag({ key: 'b', source: second.source });

    await expect(evaluate([a, b])).resolves.toEqual([true, false]);
  });

  it('accepts flag definitions', async () => {
    const { source } = createSource({ dynamic: true });

    await expect(evaluate([{ key: 'dynamic', source }])).resolves.toEqual([
      true,
    ]);
  });

  it('returns an empty list for no flags', async () => {
    await expect(evaluate([])).resolves.toEqual([]);
  });

  it('is the same as runtime.evaluate', async () => {
    const { source } = createSource({ a: true });
    const a = defineFlag({ key: 'a', source });

    await expect(runtime.evaluate([a])).resolves.toEqual([true]);
  });

  describe('when a flag fails', () => {
    it('returns the default value of that flag', async () => {
      const { source } = createSource({ a: true });
      const a = defineFlag({ key: 'a', source });
      const missing = defineFlag({
        key: 'missing',
        defaultValue: false,
        source,
      });

      await expect(evaluate([a, missing])).resolves.toEqual([true, false]);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not evaluate flag "missing": Unknown flag "missing". Returned the default value: false.',
      );
    });

    it('rejects without a default value', async () => {
      const { source } = createSource({ a: true });
      const a = defineFlag({ key: 'a', source });
      const missing = defineFlag({ key: 'missing', source });

      await expect(evaluate([a, missing])).rejects.toMatchObject({
        name: 'FlagEvaluationError',
        flagKey: 'missing',
      });
    });

    it('rejects for a source not returned by defineSource', async () => {
      const { provider } = createSource({});
      const source = {
        provider,
        project: { system: 'in-memory' as const },
      };

      await expect(evaluate([{ key: 'a', source }])).rejects.toThrow(
        'flags: The source of flag "a" must be returned by defineSource.',
      );
    });
  });
});

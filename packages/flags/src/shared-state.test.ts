import { afterEach, describe, expect, it, vi } from 'vitest';

type Flags = typeof import('./index');

/**
 * Loads a new copy of the package, as a bundler can do for each layer of an
 * application.
 */
async function loadCopy(): Promise<Flags> {
  vi.resetModules();
  return import('./index');
}

const provider = {
  metadata: { name: 'test' },
  resolveBooleanEvaluation: async () => ({ value: true }),
};

describe('shared state', () => {
  afterEach(async () => {
    const copy = await loadCopy();
    copy.runtime.setRequestSource(undefined);
    copy.runtime.reset();
  });

  it('gives each copy of the package the same runtime', async () => {
    const a = await loadCopy();
    const b = await loadCopy();

    expect(a.defineFlag).not.toBe(b.defineFlag);
    expect(a.runtime).toBe(b.runtime);
  });

  it('keeps the state on globalThis', async () => {
    const { runtime } = await loadCopy();
    const state = (globalThis as Record<symbol, { runtime?: unknown }>)[
      Symbol.for('flags.v5.state')
    ];

    expect(state?.runtime).toBe(runtime);
  });

  it('accepts a connection of a different copy', async () => {
    const a = await loadCopy();
    const b = await loadCopy();
    const connection = a.defineConnection({
      provider,
      project: { system: 'in-memory' },
    });

    const flag = b.defineFlag({ key: 'a', connection });
    await expect(flag()).resolves.toBe(true);
    await expect(b.evaluate({ key: 'a', connection })).resolves.toBe(true);
  });

  it('accepts flags of a different copy in registerFlags', async () => {
    const a = await loadCopy();
    const b = await loadCopy();
    const connection = a.defineConnection({
      provider,
      project: { system: 'in-memory' },
    });
    const flag = a.defineFlag({ key: 'a', connection });

    expect(() => b.registerFlags({ flag })).not.toThrow();
  });

  it('lets instrumentation.ts set the request source for the pages', async () => {
    // Next.js: instrumentation.ts and the pages can be separate bundles
    const instrumentation = await loadCopy();
    const pages = await loadCopy();

    const headers = new Headers({ cookie: 'user=alice' });
    instrumentation.runtime.setRequestSource(() => ({ headers }));

    const contexts: unknown[] = [];
    const connection = pages.defineConnection({
      provider: {
        metadata: { name: 'test' },
        resolveBooleanEvaluation: async (_key, _defaultValue, context) => {
          contexts.push(context);
          return { value: true };
        },
      },
      project: { system: 'in-memory' },
      getEvaluationContext: (_context, request) => ({
        user: request?.cookies?.get('user')?.value ?? 'anonymous',
      }),
    });
    const flag = pages.defineFlag({ key: 'a', connection });

    await flag();
    expect(contexts).toEqual([{ user: 'alice' }]);
  });
});

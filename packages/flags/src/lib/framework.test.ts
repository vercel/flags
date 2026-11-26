import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameworkBinding } from './framework';

const binding = (
  name: string,
  overrides: Partial<FrameworkBinding> = {},
): FrameworkBinding => ({
  name,
  getHeaders: async () => {
    throw new Error('not used');
  },
  getRequest: async () => {
    throw new Error('not used');
  },
  isFrameworkSignal: () => false,
  ...overrides,
});

/** A new copy of the module, as a bundler can make for each layer. */
async function loadCopy() {
  vi.resetModules();
  return import('./framework');
}

afterEach(async () => {
  (await loadCopy()).setFramework(undefined);
  vi.unstubAllEnvs();
});

describe('the framework binding', () => {
  it('is the binding of the alias flags/framework', async () => {
    const { getFramework } = await loadCopy();

    // The tests alias flags/framework to test/next-binding.ts
    expect(getFramework()?.name).toBe('next');
  });

  it('can be replaced, and goes back to the binding of the alias', async () => {
    const { getFramework, setFramework } = await loadCopy();
    const replacement = binding('replacement');

    setFramework(replacement);
    expect(getFramework()).toBe(replacement);

    setFramework(undefined);
    expect(getFramework()?.name).toBe('next');
  });

  it('is shared by all copies of the package in one process', async () => {
    const a = await loadCopy();
    const b = await loadCopy();
    const replacement = binding('replacement');

    a.setFramework(replacement);

    expect(a.getFramework).not.toBe(b.getFramework);
    expect(b.getFramework()).toBe(replacement);
  });

  it('asks the binding for the signals of the framework', async () => {
    const { isFrameworkSignal, setFramework } = await loadCopy();
    setFramework(
      binding('test', { isFrameworkSignal: (error) => error === 'signal' }),
    );

    expect(isFrameworkSignal('signal')).toBe(true);
    expect(isFrameworkSignal(new Error('other'))).toBe(false);
  });

  it('loads the environment of the framework one time', async () => {
    vi.stubEnv('FLAGS_TEST_VARIABLE', '');
    const { loadFrameworkEnv, setFramework } = await loadCopy();
    const loadEnv = vi.fn(async () => ({ FLAGS_TEST_VARIABLE: 'from-env' }));
    setFramework(binding('test', { loadEnv }));

    await loadFrameworkEnv();
    await loadFrameworkEnv();

    expect(loadEnv).toHaveBeenCalledTimes(1);
    // The same copy of the modules as the binding
    const { readEnv } = await import('./vercel-platform');
    expect(readEnv('FLAGS_TEST_VARIABLE')).toBe('from-env');
  });
});

describe('without a framework binding', () => {
  it('throws a clear error when the request is needed', async () => {
    const { requireFramework, setFramework } = await loadCopy();
    // A binding which is not there: as an application without a plugin
    setFramework(undefined);
    const state = (globalThis as Record<symbol, { aliased?: unknown }>)[
      Symbol.for('flags.v5.framework')
    ];
    const aliased = state?.aliased;
    if (state) {
      state.aliased = undefined;
    }
    try {
      expect(() => requireFramework()).toThrow(
        'flags: No framework gives the current request. In Next.js, wrap the configuration in next.config.ts with withFlags of @flags-sdk/next/plugin.',
      );
    } finally {
      if (state) {
        state.aliased = aliased;
      }
    }
  });
});

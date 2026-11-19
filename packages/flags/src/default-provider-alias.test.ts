import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindFlag } from './flag';
import { runtime } from './runtime';
import { defineSource } from './source';
import type { Provider } from './types';

// What a platform does at build time: an alias replaces the module
// flags/default-provider with its own, e.g. with a module of
// @vercel/flags-core which creates its VercelProvider. The replacement exports
// the same function.
const fastProvider = {
  metadata: { name: 'fast' },
  initialize: vi.fn(async () => {}),
  resolveBooleanEvaluation: vi.fn(async () => ({ value: true })),
} satisfies Provider;

vi.mock('flags/default-provider', () => ({
  createDefaultProvider: () => fastProvider,
}));

describe('flags/default-provider replaced by an alias', () => {
  beforeEach(() => {
    runtime.reset();
    fastProvider.initialize.mockClear();
    fastProvider.resolveBooleanEvaluation.mockClear();
    // Without the alias, the built-in default would need this token
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('gives flags without a source the provider of the platform', async () => {
    const flag = bindFlag({ key: 'summer-sale' });

    await expect(flag()).resolves.toBe(true);
    expect(flag.source.provider).toBe(fastProvider);
  });

  it('initializes the provider of the platform in onInit', async () => {
    bindFlag({ key: 'summer-sale' });

    await runtime.onInit();
    expect(fastProvider.initialize).toHaveBeenCalledTimes(1);
  });

  it('does not initialize the provider of the platform without a flag which uses it', async () => {
    bindFlag({
      key: 'own',
      source: defineSource({
        provider: {
          metadata: { name: 'own' },
          resolveBooleanEvaluation: async () => ({ value: true }),
        },
        project: { system: 'in-memory' },
      }),
    });

    await runtime.onInit();
    expect(fastProvider.initialize).not.toHaveBeenCalled();
  });

  it('does not initialize the provider of the platform when the application sets a default', async () => {
    bindFlag({ key: 'summer-sale' });
    runtime.configure({
      defaultSource: defineSource({
        provider: {
          metadata: { name: 'app' },
          resolveBooleanEvaluation: async () => ({ value: false }),
        },
        project: { system: 'in-memory' },
      }),
    });

    await runtime.onInit();
    expect(fastProvider.initialize).not.toHaveBeenCalled();
  });

  it('loses against the default source of the application', async () => {
    const appProvider = {
      metadata: { name: 'app' },
      resolveBooleanEvaluation: vi.fn(async () => ({ value: false })),
    } satisfies Provider;
    runtime.configure({
      defaultSource: defineSource({
        provider: appProvider,
        project: { system: 'in-memory' },
      }),
    });

    await expect(bindFlag({ key: 'summer-sale' })()).resolves.toBe(false);
    expect(fastProvider.resolveBooleanEvaluation).not.toHaveBeenCalled();
  });
});

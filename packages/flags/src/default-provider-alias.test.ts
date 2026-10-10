import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection } from './connection';
import { defineFlag } from './flag';
import { runtime } from './runtime';
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

  it('gives flags without a connection the provider of the platform', async () => {
    const flag = defineFlag({ key: 'summer-sale' });

    await expect(flag()).resolves.toBe(true);
    expect(flag.connection.provider).toBe(fastProvider);
  });

  it('initializes the provider of the platform in onInit', async () => {
    defineFlag({ key: 'summer-sale' });

    await runtime.onInit();
    expect(fastProvider.initialize).toHaveBeenCalledTimes(1);
  });

  it('does not initialize the provider of the platform without a flag which uses it', async () => {
    defineFlag({
      key: 'own',
      connection: defineConnection({
        provider: {
          metadata: { name: 'own' },
          resolveBooleanEvaluation: async () => ({ value: true }),
        },
        project: { platform: 'in-memory' },
      }),
    });

    await runtime.onInit();
    expect(fastProvider.initialize).not.toHaveBeenCalled();
  });

  it('does not initialize the provider of the platform when the application sets a default', async () => {
    defineFlag({ key: 'summer-sale' });
    runtime.configure({
      defaultConnection: defineConnection({
        provider: {
          metadata: { name: 'app' },
          resolveBooleanEvaluation: async () => ({ value: false }),
        },
        project: { platform: 'in-memory' },
      }),
    });

    await runtime.onInit();
    expect(fastProvider.initialize).not.toHaveBeenCalled();
  });

  it('loses against the default connection of the application', async () => {
    const appProvider = {
      metadata: { name: 'app' },
      resolveBooleanEvaluation: vi.fn(async () => ({ value: false })),
    } satisfies Provider;
    runtime.configure({
      defaultConnection: defineConnection({
        provider: appProvider,
        project: { platform: 'in-memory' },
      }),
    });

    await expect(defineFlag({ key: 'summer-sale' })()).resolves.toBe(false);
    expect(fastProvider.resolveBooleanEvaluation).not.toHaveBeenCalled();
  });
});

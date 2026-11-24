import type { Provider } from '@openfeature/server-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalConfigProvider, type GlobalConfigReader } from '.';

function clientWith(items: Record<string, unknown>) {
  return {
    get: vi.fn(async (key: string) => items[key]),
  } as unknown as GlobalConfigReader & { get: ReturnType<typeof vi.fn> };
}

const context = {};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GlobalConfigProvider', () => {
  it('is an OpenFeature provider', () => {
    // The type check fails if the provider does not match the Provider of
    // OpenFeature, e.g. for OpenFeature.setProvider()
    const provider: Provider = new GlobalConfigProvider({
      client: clientWith({}),
    });
    expect(provider.metadata.name).toBe('global-config');
    expect(provider.runsOn).toBe('server');
  });

  it('resolves each type from the item flags', async () => {
    const provider = new GlobalConfigProvider({
      client: clientWith({
        flags: {
          summerSale: true,
          banner: 'Free shipping',
          discount: 15,
          theme: { color: 'blue' },
        },
      }),
    });

    await expect(
      provider.resolveBooleanEvaluation('summerSale', false, context),
    ).resolves.toEqual({ value: true, reason: 'STATIC' });
    await expect(
      provider.resolveStringEvaluation('banner', '', context),
    ).resolves.toEqual({ value: 'Free shipping', reason: 'STATIC' });
    await expect(
      provider.resolveNumberEvaluation('discount', 0, context),
    ).resolves.toEqual({ value: 15, reason: 'STATIC' });
    await expect(
      provider.resolveObjectEvaluation('theme', {}, context),
    ).resolves.toEqual({ value: { color: 'blue' }, reason: 'STATIC' });
  });

  it('reads a different item with itemKey', async () => {
    const client = clientWith({ 'my-flags': { summerSale: true } });
    const provider = new GlobalConfigProvider({ client, itemKey: 'my-flags' });

    await expect(
      provider.resolveBooleanEvaluation('summerSale', false, context),
    ).resolves.toMatchObject({ value: true });
    expect(client.get).toHaveBeenCalledWith('my-flags');
  });

  it('returns the default value with FLAG_NOT_FOUND for an unknown flag', async () => {
    const provider = new GlobalConfigProvider({
      client: clientWith({ flags: {} }),
    });

    await expect(
      provider.resolveBooleanEvaluation('missing', true, context),
    ).resolves.toEqual({
      value: true,
      reason: 'ERROR',
      errorCode: 'FLAG_NOT_FOUND',
      errorMessage:
        '@flags-sdk/global-config: The flag "missing" is not in the item "flags" of Global Config.',
    });
  });

  it('returns the default value with TYPE_MISMATCH for a value of another type', async () => {
    const provider = new GlobalConfigProvider({
      client: clientWith({ flags: { summerSale: 'yes' } }),
    });

    await expect(
      provider.resolveBooleanEvaluation('summerSale', false, context),
    ).resolves.toMatchObject({
      value: false,
      reason: 'ERROR',
      errorCode: 'TYPE_MISMATCH',
    });
  });

  it('returns the default value with GENERAL when the item is missing', async () => {
    const provider = new GlobalConfigProvider({ client: clientWith({}) });

    await expect(
      provider.resolveStringEvaluation('banner', 'none', context),
    ).resolves.toMatchObject({
      value: 'none',
      reason: 'ERROR',
      errorCode: 'GENERAL',
    });
  });

  it('returns the default value with GENERAL when the read fails', async () => {
    const provider = new GlobalConfigProvider({
      client: {
        get: async () => {
          throw new Error('network');
        },
      } as unknown as GlobalConfigReader,
    });

    await expect(
      provider.resolveBooleanEvaluation('summerSale', false, context),
    ).resolves.toEqual({
      value: false,
      reason: 'ERROR',
      errorCode: 'GENERAL',
      errorMessage: 'network',
    });
  });

  it('reads the item once for flags which evaluate at the same time', async () => {
    const client = clientWith({ flags: { a: true, b: false } });
    const provider = new GlobalConfigProvider({ client });

    await Promise.all([
      provider.resolveBooleanEvaluation('a', false, context),
      provider.resolveBooleanEvaluation('b', true, context),
    ]);
    expect(client.get).toHaveBeenCalledTimes(1);

    // A later evaluation reads the item again
    await provider.resolveBooleanEvaluation('a', false, context);
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('needs no environment variable until the first evaluation', async () => {
    vi.stubEnv('GLOBAL_CONFIG', '');
    vi.stubEnv('EDGE_CONFIG', '');
    // A tool can import the source without the environment variable
    const provider = new GlobalConfigProvider();

    await expect(
      provider.resolveBooleanEvaluation('summerSale', false, context),
    ).resolves.toEqual({
      value: false,
      reason: 'ERROR',
      errorCode: 'GENERAL',
      errorMessage:
        '@flags-sdk/global-config: Missing the environment variable GLOBAL_CONFIG.',
    });
  });
});

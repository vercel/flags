import { afterEach, describe, expect, it, vi } from 'vitest';
import { flags, platformDefaultProvider } from './index';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the default provider of the platform', () => {
  it('is the provider of @vercel/flags-core for a build on Vercel', () => {
    vi.stubEnv('VERCEL', '1');

    expect(platformDefaultProvider('/app', true, () => 'found')).toBe(
      '@vercel/flags-core/default-provider',
    );
    // Development uses OFREP
    expect(
      platformDefaultProvider('/app', false, () => 'found'),
    ).toBeUndefined();
  });

  it('is not set without @vercel/flags-core, or outside of Vercel', () => {
    const notInstalled = () => {
      throw new Error('Cannot find module');
    };
    vi.stubEnv('VERCEL', '1');
    expect(platformDefaultProvider('/app', true, notInstalled)).toBeUndefined();
    vi.stubEnv('VERCEL', '');
    expect(
      platformDefaultProvider('/app', true, () => 'found'),
    ).toBeUndefined();
  });
});

describe('flags', () => {
  type ConfigHook = (
    config: { root?: string },
    env: { command: 'build' | 'serve' },
  ) => { ssr?: { noExternal?: string[] } } | undefined;
  const configOf = (plugin: ReturnType<typeof flags>) =>
    plugin.config as unknown as ConfigHook;

  it('bundles the SDK and the package of the binding', () => {
    const plugin = flags({
      binding: '@flags-sdk/example/binding',
      bundle: ['@flags-sdk/example'],
      defaultProvider: false,
    });
    const config = configOf(plugin)({ root: '/app' }, { command: 'build' });

    expect(config?.ssr?.noExternal).toEqual(['flags', '@flags-sdk/example']);
  });

  it('changes nothing without a binding and without a default provider', () => {
    const plugin = flags({ defaultProvider: false });

    expect(
      configOf(plugin)({ root: '/app' }, { command: 'build' }),
    ).toBeUndefined();
  });
});

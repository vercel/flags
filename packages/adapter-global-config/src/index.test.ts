import type { GlobalConfigClient } from '@vercel/global-config';
import type { ReadonlyRequestCookies } from 'flags';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGlobalConfigAdapter,
  globalConfigAdapter,
  resetDefaultGlobalConfigAdapter,
} from '.';

describe('createGlobalConfigAdapter', () => {
  it('should allow creating an adapter with a client', () => {
    const fakeGlobalConfigClient = {} as GlobalConfigClient;
    const adapter = createGlobalConfigAdapter(fakeGlobalConfigClient);
    expect(adapter).toBeDefined();
  });

  it('returns the same adapter instance on every call', () => {
    const fakeGlobalConfigClient = {} as GlobalConfigClient;
    const adapter = createGlobalConfigAdapter(fakeGlobalConfigClient);
    expect(adapter()).toBe(adapter());
  });

  describe('adapterId', () => {
    it('shares one adapterId across all adapters from the same factory call', () => {
      const fakeGlobalConfigClient = {} as GlobalConfigClient;
      const adapter = createGlobalConfigAdapter(fakeGlobalConfigClient);
      const a = adapter();
      const b = adapter();
      expect(a).toBe(b);
      expect(a.adapterId).toBeDefined();
      expect(a.adapterId).toBe(b.adapterId);
    });

    it('uses different adapterIds across separate factory calls', () => {
      const fakeGlobalConfigClient = {} as GlobalConfigClient;
      const adapterA = createGlobalConfigAdapter(fakeGlobalConfigClient);
      const adapterB = createGlobalConfigAdapter(fakeGlobalConfigClient);
      expect(adapterA().adapterId).not.toBe(adapterB().adapterId);
    });
  });

  describe('bulkDecide', () => {
    it('resolves all requested flag keys from Global Config in one read', async () => {
      const fakeGlobalConfigClient = {
        get: vi.fn(async () => ({
          'flag-a': true,
          'flag-b': false,
          'flag-c': true,
        })),
      } as unknown as GlobalConfigClient;
      const adapter = createGlobalConfigAdapter(fakeGlobalConfigClient);
      const headers = new Headers();

      const result = await adapter().bulkDecide!({
        flags: [{ key: 'flag-a' }, { key: 'flag-b' }],
        entities: {},
        headers,
        cookies: {} as ReadonlyRequestCookies,
      });

      expect(result).toEqual({ 'flag-a': true, 'flag-b': false });
      expect(fakeGlobalConfigClient.get).toHaveBeenCalledOnce();
    });

    it('omits keys missing from Global Config so the SDK applies defaultValue', async () => {
      const fakeGlobalConfigClient = {
        get: vi.fn(async () => ({ 'flag-a': true })),
      } as unknown as GlobalConfigClient;
      const adapter = createGlobalConfigAdapter(fakeGlobalConfigClient);
      const headers = new Headers();

      const result = await adapter().bulkDecide!({
        flags: [{ key: 'flag-a' }, { key: 'flag-missing' }],
        entities: {},
        headers,
        cookies: {} as ReadonlyRequestCookies,
      });

      expect(result).toEqual({ 'flag-a': true });
    });

    it('shares the per-request cache with decide', async () => {
      const fakeGlobalConfigClient = {
        get: vi.fn(async () => ({ 'flag-a': true, 'flag-b': false })),
      } as unknown as GlobalConfigClient;
      const adapter = createGlobalConfigAdapter(fakeGlobalConfigClient);
      const headers = new Headers();

      await adapter().decide({
        key: 'flag-a',
        entities: {},
        headers,
        cookies: {} as ReadonlyRequestCookies,
      });

      await adapter().bulkDecide!({
        flags: [{ key: 'flag-b' }],
        entities: {},
        headers,
        cookies: {} as ReadonlyRequestCookies,
      });

      expect(fakeGlobalConfigClient.get).toHaveBeenCalledOnce();
    });
  });

  it('should allow creating an adapter with a connection string', () => {
    const adapter = createGlobalConfigAdapter(
      'https://edge-config.vercel.com/ecfg_xxx?token=yyy',
    );
    expect(adapter).toBeDefined();
  });

  it('should allow deciding', async () => {
    const fakeGlobalConfigClient = {
      get: vi.fn(async () => ({ 'test-key': true })),
    } as unknown as GlobalConfigClient;
    const adapter = createGlobalConfigAdapter(fakeGlobalConfigClient);
    await expect(
      adapter().decide({
        key: 'test-key',
        entities: {},
        headers: new Headers(),
        cookies: {} as ReadonlyRequestCookies,
      }),
    ).resolves.toEqual(true);
    expect(fakeGlobalConfigClient.get).toHaveBeenCalledWith('flags');
  });

  describe('caching', () => {
    it('caches for the duration of a request', async () => {
      const fakeGlobalConfigClient = {
        get: vi.fn(async () => ({ 'test-key': true })),
      } as unknown as GlobalConfigClient;
      const adapter = createGlobalConfigAdapter(fakeGlobalConfigClient);

      const headers = new Headers();

      // call once
      await expect(
        adapter().decide({
          key: 'test-key',
          entities: {},
          headers,
          cookies: {} as ReadonlyRequestCookies,
        }),
      ).resolves.toEqual(true);

      // call again with the same headers instance
      // to simulate a read within the same request
      await expect(
        adapter().decide({
          key: 'test-key',
          entities: {},
          headers,
          cookies: {} as ReadonlyRequestCookies,
        }),
      ).resolves.toEqual(true);
      expect(fakeGlobalConfigClient.get).toHaveBeenCalledWith('flags');
      expect(fakeGlobalConfigClient.get).toHaveBeenCalledOnce();
    });
    it('does not cache between requests', async () => {
      const fakeGlobalConfigClient = {
        get: vi.fn(async () => ({ 'test-key': true })),
      } as unknown as GlobalConfigClient;
      const adapter = createGlobalConfigAdapter(fakeGlobalConfigClient);

      // call once
      await expect(
        adapter().decide({
          key: 'test-key',
          entities: {},
          headers: new Headers(),
          cookies: {} as ReadonlyRequestCookies,
        }),
      ).resolves.toEqual(true);

      // call again with a different headers instance
      // to simulate a new request
      await expect(
        adapter().decide({
          key: 'test-key',
          entities: {},
          headers: new Headers(),
          cookies: {} as ReadonlyRequestCookies,
        }),
      ).resolves.toEqual(true);

      expect(fakeGlobalConfigClient.get).toHaveBeenCalledWith('flags');
      expect(fakeGlobalConfigClient.get).toHaveBeenCalledTimes(2);
    });
  });
});

describe('globalConfigAdapter', () => {
  beforeEach(() => {
    resetDefaultGlobalConfigAdapter();
  });

  it('default adapter should throw on usage when GLOBAL_CONFIG is not set', () => {
    expect(() => globalConfigAdapter()).toThrowError(
      '@flags-sdk/global-config: Missing GLOBAL_CONFIG env var',
    );
  });

  it('should export a default adapter', () => {
    process.env.GLOBAL_CONFIG =
      'https://edge-config.vercel.com/ecfg_xxx?token=yyy';
    const adapter = globalConfigAdapter();
    expect(adapter).toBeDefined();
    delete process.env.GLOBAL_CONFIG;
  });
});

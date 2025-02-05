import { expect, it, describe, vi, beforeEach } from 'vitest';
import {
  createEdgeConfigAdapter,
  edgeConfigAdapter,
  resetDefaultEdgeConfigAdapter,
} from '.';
import type { EdgeConfigClient } from '@vercel/edge-config';
import type { ReadonlyRequestCookies } from '@vercel/flags';

describe('createEdgeConfigAdapter', () => {
  it('should allow creating an adapter with a client', () => {
    const fakeEdgeConfigClient = {} as EdgeConfigClient;
    const adapter = createEdgeConfigAdapter(fakeEdgeConfigClient);
    expect(adapter).toBeDefined();
  });

  it('should allow creating an adapter with a connection string', () => {
    const adapter = createEdgeConfigAdapter(
      'https://edge-config.vercel.com/ecfg_xxx?token=yyy',
    );
    expect(adapter).toBeDefined();
  });

  it('should allow deciding', async () => {
    const fakeEdgeConfigClient = {
      get: vi.fn(async () => ({ 'test-key': true })),
    } as unknown as EdgeConfigClient;
    const adapter = createEdgeConfigAdapter(fakeEdgeConfigClient);
    await expect(
      adapter().decide({
        key: 'test-key',
        entities: {},
        headers: new Headers(),
        cookies: {} as ReadonlyRequestCookies,
      }),
    ).resolves.toEqual(true);
    expect(fakeEdgeConfigClient.get).toHaveBeenCalledWith('flags');
  });
});

describe('edgeConfigAdapter', () => {
  beforeEach(() => {
    resetDefaultEdgeConfigAdapter();
  });

  it('default adapter should throw on usage when EDGE_CONFIG is not set', () => {
    expect(() => edgeConfigAdapter()).toThrowError(
      '@flags-sdk/edge-config: Missing EDGE_CONFIG env var',
    );
  });

  it('should export a default adapter', () => {
    process.env.EDGE_CONFIG =
      'https://edge-config.vercel.com/ecfg_xxx?token=yyy';
    const adapter = edgeConfigAdapter();
    expect(adapter).toBeDefined();
    delete process.env.EDGE_CONFIG;
  });
});

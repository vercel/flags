import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './manifest';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET of @flags-sdk/next/manifest', () => {
  it('returns the manifest in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const response = await GET();

    expect(response.headers.get('cache-control')).toBe('no-store');
    // Without the loader of withFlags, there are no modules
    await expect(response.json()).resolves.toEqual({
      version: 1,
      sources: {},
      definitions: {},
    });
  });

  it('is not a public endpoint in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect((await GET()).status).toBe(404);
  });

  it('returns the manifest for the build of withFlags', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('__FLAGS_WRITE_MANIFEST', '1');

    expect((await GET()).status).toBe(200);
  });
});

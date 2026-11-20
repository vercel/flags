import { afterEach, describe, expect, it, vi } from 'vitest';

import { encryptValues } from './encrypt-values-cached';

const { cacheLife } = vi.hoisted(() => ({ cacheLife: vi.fn() }));
vi.mock('next/cache', () => ({ cacheLife }));

afterEach(() => {
  vi.unstubAllEnvs();
  cacheLife.mockClear();
});

describe('encryptValues in use cache', () => {
  it('returns the token, and caches it for long', async () => {
    vi.stubEnv('FLAGS_SECRET', 'Tw1R5-WuhN6vxp9b0s6h0bCdrBQwZXMbGwjzYm1jnUs');

    const result = await encryptValues({ a: true }, { method: 'secret' });

    expect(result).toEqual({ token: expect.any(String) });
    expect(cacheLife).toHaveBeenCalledWith('max');
  });

  // Next.js fails a prerender when a cache function throws, also when the
  // caller catches the error
  it('returns the error instead of throwing, and caches it shortly', async () => {
    vi.stubEnv('FLAGS_SECRET', 'not-a-secret');

    const result = await encryptValues({ a: true }, { method: 'secret' });

    expect(result).toEqual({
      error: expect.stringContaining('Invalid FLAGS_SECRET'),
    });
    expect(cacheLife).toHaveBeenCalledWith('minutes');
  });
});

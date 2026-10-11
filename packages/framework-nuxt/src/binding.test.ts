import { afterEach, describe, expect, it, vi } from 'vitest';
import * as nitro from '#imports';
import { getRequest, rethrowSignal } from './binding';

vi.mock('#imports', async (original) => ({
  ...(await original<typeof import('#imports')>()),
  useEvent: vi.fn(),
  getRequestURL: vi.fn(() => new URL('https://shop.example/a')),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Nuxt binding', () => {
  it('gives the request of useEvent()', () => {
    const headers = new Headers({ cookie: 'user=alice' });
    vi.mocked(nitro.useEvent).mockReturnValue({ headers });

    const init = getRequest();
    expect(init?.headers).toBe(headers);
    expect(String(init?.url)).toBe('https://shop.example/a');
  });

  it('gives no request without the async context', () => {
    vi.mocked(nitro.useEvent).mockImplementation(() => {
      throw new Error('Nitro request context is not available');
    });

    expect(getRequest()).toBeUndefined();
  });

  it('lets an H3Error through', () => {
    class H3Error extends Error {
      static __h3_error__ = true;
    }

    expect(() => rethrowSignal(new H3Error('Forbidden'))).toThrow('Forbidden');
    expect(() => rethrowSignal(new Error('Other'))).not.toThrow();
  });
});

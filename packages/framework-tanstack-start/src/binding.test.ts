import * as tanStack from 'flags:tanstack-start/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRequest, rethrowSignal } from './binding';

vi.mock('flags:tanstack-start/server', () => ({ getRequest: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the TanStack Start binding', () => {
  it('gives the request of getRequest()', () => {
    const request = new Request('https://shop.example/cart');
    vi.mocked(tanStack.getRequest).mockReturnValue(request);

    const init = getRequest();
    expect(init?.headers).toBe(request.headers);
    expect(String(init?.url)).toBe('https://shop.example/cart');
  });

  it('gives no request outside of a request', () => {
    vi.mocked(tanStack.getRequest).mockImplementation(() => {
      throw new Error('No HTTPEvent found in AsyncLocalStorage');
    });

    expect(getRequest()).toBeUndefined();
  });

  it('lets redirect() and notFound() of TanStack Router through', () => {
    const redirect = Object.assign(new Response(null, { status: 307 }), {
      options: { to: '/login' },
    });

    expect(() => rethrowSignal(redirect)).toThrow();
    expect(() => rethrowSignal({ isNotFound: true })).toThrow();
    expect(() => rethrowSignal(new Error('Other'))).not.toThrow();
  });
});

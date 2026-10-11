import { error, redirect } from '@sveltejs/kit';
import type { Runtime } from 'flags';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as svelteKit from '$app/server';
import { getRequest, rethrowSignal, setupFramework } from './binding';

vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

// Calls a function which throws a signal, and returns the signal
function thrown(signal: () => unknown): unknown {
  try {
    signal();
  } catch (value) {
    return value;
  }
  throw new Error('No signal');
}

describe('the SvelteKit binding', () => {
  it('gives the request of getRequestEvent()', () => {
    const request = new Request('https://shop.example/cart');
    vi.mocked(svelteKit.getRequestEvent).mockReturnValue({
      request,
      url: new URL(request.url),
    } as ReturnType<typeof svelteKit.getRequestEvent>);

    const init = getRequest();
    expect(init?.headers).toBe(request.headers);
    expect(String(init?.url)).toBe('https://shop.example/cart');
  });

  it('gives no request outside of a request', () => {
    vi.mocked(svelteKit.getRequestEvent).mockImplementation(() => {
      throw new Error('Not in a request');
    });

    expect(getRequest()).toBeUndefined();
  });

  it('lets redirect() and error() of SvelteKit through', () => {
    const toLogin = thrown(() => redirect(307, '/login'));
    const forbidden = thrown(() => error(403, 'Forbidden'));

    expect(() => rethrowSignal(toLogin)).toThrow();
    expect(() => rethrowSignal(forbidden)).toThrow();
    expect(() => rethrowSignal(new Error('Other'))).not.toThrow();
  });

  it('sets up the request source, the rethrow and the config source', () => {
    const fake = {
      setRequestSource: vi.fn(),
      setRethrow: vi.fn(),
      setConfigSource: vi.fn(),
    };

    setupFramework(fake as unknown as Runtime);
    expect(fake.setRequestSource).toHaveBeenCalledWith(getRequest);
    expect(fake.setRethrow).toHaveBeenCalledWith(rethrowSignal);
    expect(fake.setConfigSource).toHaveBeenCalledOnce();
  });
});

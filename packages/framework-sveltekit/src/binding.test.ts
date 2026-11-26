import { error, redirect } from '@sveltejs/kit';
import { flag } from 'flags';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as svelteKit from '$app/server';
import { binding, loadSvelteKitEnv } from './binding';

vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));
vi.mock('$env/static/private', () => ({
  FLAGS_SECRET: 'secret-from-sveltekit',
  FLAGS_PRECOMPUTE_SECRET: undefined,
}));
vi.mock('$env/dynamic/private', () => ({
  env: { VERCEL_OIDC_TOKEN: 'token-from-sveltekit' },
}));

const getRequestEvent = vi.mocked(svelteKit.getRequestEvent);

function inRequest(init: HeadersInit) {
  const request = new Request('https://shop.example', { headers: init });
  getRequestEvent.mockReturnValue({
    request,
    url: new URL(request.url),
  } as never);
  return request;
}

afterEach(() => {
  getRequestEvent.mockReset();
});

describe('the binding of SvelteKit', () => {
  it('gives the headers of the current request, the same object each time', async () => {
    const request = inRequest({ 'x-test': '1' });

    const headers = await binding.getHeaders();
    expect(headers.get('x-test')).toBe('1');
    expect(headers).toBe(request.headers);
    expect((await binding.getRequest()).headers).toBe(headers);
  });

  it('throws the error of SvelteKit outside of a request', async () => {
    getRequestEvent.mockImplementation(() => {
      throw new Error(
        'Can only read the current request event inside functions invoked during handle',
      );
    });

    await expect(binding.getRequest()).rejects.toThrow(
      'Can only read the current request event',
    );
  });

  it('knows redirect() and error() of SvelteKit as signals', () => {
    const signal = (fn: () => never) => {
      try {
        fn();
      } catch (thrown) {
        return thrown;
      }
    };

    expect(binding.isFrameworkSignal(signal(() => redirect(307, '/')))).toBe(
      true,
    );
    expect(binding.isFrameworkSignal(signal(() => error(404)))).toBe(true);
    expect(binding.isFrameworkSignal(new Error('the provider failed'))).toBe(
      false,
    );
  });

  it('gives the environment of SvelteKit', async () => {
    await expect(loadSvelteKitEnv()).resolves.toEqual({
      FLAGS_SECRET: 'secret-from-sveltekit',
      FLAGS_PRECOMPUTE_SECRET: undefined,
      VERCEL_OIDC_TOKEN: 'token-from-sveltekit',
    });
  });
});

describe('a flag in SvelteKit', () => {
  it('gets the request from getRequestEvent()', async () => {
    inRequest({ cookie: 'user=alice' });
    const isAlice = flag<boolean>({
      key: 'sveltekit-is-alice',
      decide: ({ cookies }) => cookies.get('user')?.value === 'alice',
    });

    await expect(isAlice()).resolves.toBe(true);
  });

  it('follows the rules of Next.js: the defaultValue on an error', async () => {
    inRequest({});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const failing = flag<boolean>({
      key: 'sveltekit-failing',
      defaultValue: false,
      decide: () => {
        throw new Error('the provider failed');
      },
    });

    await expect(failing()).resolves.toBe(false);
  });

  it('throws a redirect of SvelteKit again, also with a defaultValue', async () => {
    inRequest({});
    const redirecting = flag<boolean>({
      key: 'sveltekit-redirect',
      defaultValue: false,
      decide: () => redirect(307, '/login'),
    });

    await expect(redirecting()).rejects.toMatchObject({ status: 307 });
  });
});

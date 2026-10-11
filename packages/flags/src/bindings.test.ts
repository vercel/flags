import * as tanStack from 'flags:tanstack-start/server';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as nitro from '#imports';
import * as svelteKit from '$app/server';
import { toFlagsRequest } from './express';
import { flags, rethrowSignal as rethrowHono } from './hono';
import {
  getRequest as nuxtRequest,
  rethrowSignal as rethrowNitro,
} from './nuxt-runtime';
import { runtime } from './runtime';
import {
  rethrowSignal as rethrowSvelteKit,
  setupFramework,
  getRequest as svelteKitRequest,
} from './sveltekit';
import {
  rethrowSignal as rethrowTanStack,
  getRequest as tanStackRequest,
} from './tanstack-start';
import { platformDefaultProvider } from './vite';

vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));
vi.mock('flags:tanstack-start/server', () => ({ getRequest: vi.fn() }));
vi.mock('#imports', () => ({
  useEvent: vi.fn(),
  getRequestURL: vi.fn(() => new URL('https://shop.example/a')),
}));

beforeEach(() => {
  runtime.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('SvelteKit', () => {
  it('gives the request of getRequestEvent()', () => {
    const request = new Request('https://shop.example/cart');
    vi.mocked(svelteKit.getRequestEvent).mockReturnValue({
      request,
      url: new URL(request.url),
    });

    const init = svelteKitRequest();
    expect(init?.headers).toBe(request.headers);
    expect(String(init?.url)).toBe('https://shop.example/cart');
  });

  it('gives no request outside of a request', () => {
    vi.mocked(svelteKit.getRequestEvent).mockImplementation(() => {
      throw new Error('Not in a request');
    });

    expect(svelteKitRequest()).toBeUndefined();
  });

  it('lets redirect() and error() of SvelteKit through', () => {
    class Redirect {
      constructor(
        readonly status: number,
        readonly location: string,
      ) {}
    }
    class HttpError {
      constructor(
        readonly status: number,
        readonly body: unknown,
      ) {}
    }

    expect(() => rethrowSvelteKit(new Redirect(307, '/login'))).toThrow();
    expect(() => rethrowSvelteKit(new HttpError(403, {}))).toThrow();
    expect(() => rethrowSvelteKit(new Error('Other'))).not.toThrow();
  });

  it('sets up the request source, the rethrow and the config source', () => {
    const setRequestSource = vi.spyOn(runtime, 'setRequestSource');
    const setRethrow = vi.spyOn(runtime, 'setRethrow');
    const setConfigSource = vi.spyOn(runtime, 'setConfigSource');

    setupFramework(runtime);
    expect(setRequestSource).toHaveBeenCalledWith(svelteKitRequest);
    expect(setRethrow).toHaveBeenCalledWith(rethrowSvelteKit);
    expect(setConfigSource).toHaveBeenCalledOnce();
  });
});

describe('Nuxt', () => {
  it('gives the request of useEvent()', () => {
    const headers = new Headers({ cookie: 'user=alice' });
    vi.mocked(nitro.useEvent).mockReturnValue({ headers });

    const init = nuxtRequest();
    expect(init?.headers).toBe(headers);
    expect(String(init?.url)).toBe('https://shop.example/a');
  });

  it('gives no request without the async context', () => {
    vi.mocked(nitro.useEvent).mockImplementation(() => {
      throw new Error('Nitro request context is not available');
    });

    expect(nuxtRequest()).toBeUndefined();
  });

  it('lets an H3Error through', () => {
    class H3Error extends Error {
      static __h3_error__ = true;
    }

    expect(() => rethrowNitro(new H3Error('Forbidden'))).toThrow('Forbidden');
    expect(() => rethrowNitro(new Error('Other'))).not.toThrow();
  });
});

describe('Hono', () => {
  it('runs each request in onInvoke', async () => {
    const onInvoke = vi.spyOn(runtime, 'onInvoke');
    const request = new Request('https://shop.example/');
    const next = vi.fn(async () => {});

    await flags()({ req: { raw: request } }, next);
    expect(onInvoke).toHaveBeenCalledWith(request, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('configures the SDK one time', () => {
    const configure = vi.spyOn(runtime, 'configure');
    const config = {};

    flags({ config });
    expect(configure).toHaveBeenCalledWith(config);
  });

  it('lets an HTTPException of Hono through', () => {
    // Hono does not set the name of the error
    class HTTPException extends Error {
      getResponse() {
        return new Response(null, { status: 403 });
      }
    }

    expect(() => rethrowHono(new HTTPException('Blocked'))).toThrow('Blocked');
    expect(() => rethrowHono(new Error('Other'))).not.toThrow();
  });
});

describe('Express', () => {
  it('converts the headers and the URL of a Node.js request', () => {
    const init = toFlagsRequest({
      headers: {
        host: 'shop.example',
        cookie: 'user=alice',
        'x-list': ['a', 'b'],
        'x-missing': undefined,
      },
      originalUrl: '/cart?step=2',
      protocol: 'https',
    });

    expect(init.headers?.get('cookie')).toBe('user=alice');
    expect(init.headers?.get('x-list')).toBe('a, b');
    expect(init.headers?.has('x-missing')).toBe(false);
    expect(String(init.url)).toBe('https://shop.example/cart?step=2');
  });
});

describe('TanStack Start', () => {
  it('gives the request of getRequest()', () => {
    const request = new Request('https://shop.example/cart');
    vi.mocked(tanStack.getRequest).mockReturnValue(request);

    const init = tanStackRequest();
    expect(init?.headers).toBe(request.headers);
    expect(String(init?.url)).toBe('https://shop.example/cart');
  });

  it('gives no request outside of a request', () => {
    vi.mocked(tanStack.getRequest).mockImplementation(() => {
      throw new Error('No HTTPEvent found in AsyncLocalStorage');
    });

    expect(tanStackRequest()).toBeUndefined();
  });

  it('lets redirect() and notFound() of TanStack Router through', () => {
    // What redirect() returns: a Response with options
    const redirect = Object.assign(new Response(null, { status: 307 }), {
      options: { to: '/login' },
    });

    expect(() => rethrowTanStack(redirect)).toThrow();
    expect(() => rethrowTanStack({ isNotFound: true })).toThrow();
    expect(() => rethrowTanStack(new Response(null))).not.toThrow();
    expect(() => rethrowTanStack(new Error('Other'))).not.toThrow();
  });
});

describe('the default provider of the platform', () => {
  it('is the provider of @vercel/flags-core for a build on Vercel', () => {
    vi.stubEnv('VERCEL', '1');
    const project = mkdtempSync(join(tmpdir(), 'flags-platform-'));
    const pkg = join(project, 'node_modules/@vercel/flags-core');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({
        name: '@vercel/flags-core',
        exports: { './default-provider': './default-provider.js' },
      }),
    );
    writeFileSync(join(pkg, 'default-provider.js'), '');

    expect(platformDefaultProvider(project, true)).toBe(
      '@vercel/flags-core/default-provider',
    );
    // Development uses OFREP
    expect(platformDefaultProvider(project, false)).toBeUndefined();
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

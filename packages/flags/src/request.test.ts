import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineConnection } from './connection';
import { defineFlag } from './flag';
import { createFlagsRequest } from './request';
import { runtime } from './runtime';
import type {
  FlagsRequest,
  FlagsRequestInit,
  ReadonlyRequestCookies,
  RequestCookie,
} from './types';

function withCookieHeader(cookie: string) {
  return createFlagsRequest({ headers: new Headers({ cookie }) });
}

describe('FlagsRequest', () => {
  describe('types', () => {
    it('accepts a Web Request as init', () => {
      expectTypeOf<Request>().toExtend<FlagsRequestInit>();
    });

    it('accepts the cookies of Next.js', () => {
      // The shape of ReadonlyRequestCookies of Next.js
      interface NextCookies {
        get(
          ...args: [name: string] | [RequestCookie]
        ): RequestCookie | undefined;
        getAll(...args: [name: string] | [RequestCookie] | []): RequestCookie[];
        has(name: string): boolean;
        readonly size: number;
      }
      expectTypeOf<NextCookies>().toExtend<ReadonlyRequestCookies>();
    });

    it('accepts an init without any property', () => {
      expectTypeOf<Record<never, never>>().toExtend<FlagsRequestInit>();
    });

    it('can only be read', () => {
      const request = createFlagsRequest({ url: 'https://example.com/a' });
      void (() => {
        // @ts-expect-error the headers can not be replaced
        request.headers = new Headers();
        // @ts-expect-error the URL can not be modified
        request.url.pathname = '/b';
        // @ts-expect-error the headers can not be modified
        request.headers?.set('a', 'b');
      });
    });
  });

  describe('headers', () => {
    it('are the headers of the framework', () => {
      const headers = new Headers({ 'x-user': 'alice' });
      expect(createFlagsRequest({ headers }).headers).toBe(headers);
    });

    it('are undefined if the framework gives none', () => {
      expect(createFlagsRequest({}).headers).toBeUndefined();
    });
  });

  describe('url', () => {
    it('is a URL made from a string', () => {
      const { url } = createFlagsRequest({
        url: 'https://example.com/teams/acme?tab=1',
      });
      expect(url?.pathname).toBe('/teams/acme');
      expect(url?.searchParams.get('tab')).toBe('1');
    });

    it('is a copy of a URL', () => {
      const original = new URL('https://example.com/a');
      const { url } = createFlagsRequest({ url: original });
      expect(url?.href).toBe(original.href);
      expect(url).not.toBe(original);
    });

    it('is undefined if the framework gives none', () => {
      expect(createFlagsRequest({}).url).toBeUndefined();
    });

    it('throws for a URL which is not a full URL', () => {
      const request = createFlagsRequest({ url: '/teams/acme' });
      expect(() => request.url).toThrow(
        'flags: The URL of the request must be a full URL, but it is "/teams/acme".',
      );
    });

    it('is created once', () => {
      const request = createFlagsRequest({ url: 'https://example.com' });
      expect(request.url).toBe(request.url);
    });
  });

  describe('cookies', () => {
    it('are the cookies of the framework', () => {
      const cookies: ReadonlyRequestCookies = {
        get: () => ({ name: 'a', value: 'from-framework' }),
        getAll: () => [],
        has: () => true,
      };
      const request = createFlagsRequest({
        headers: new Headers({ cookie: 'a=from-header' }),
        cookies,
      });
      expect(request.cookies).toBe(cookies);
    });

    it('come from the Cookie header without cookies of the framework', () => {
      const { cookies } = withCookieHeader('user=alice; theme=dark');

      expect(cookies?.get('user')).toEqual({ name: 'user', value: 'alice' });
      expect(cookies?.has('theme')).toBe(true);
      expect(cookies?.has('missing')).toBe(false);
      expect(cookies?.get('missing')).toBeUndefined();
      expect(cookies?.getAll()).toEqual([
        { name: 'user', value: 'alice' },
        { name: 'theme', value: 'dark' },
      ]);
    });

    it('are empty with headers but without a Cookie header', () => {
      const { cookies } = createFlagsRequest({ headers: new Headers() });
      expect(cookies?.getAll()).toEqual([]);
    });

    it('are undefined without headers and without cookies', () => {
      expect(createFlagsRequest({}).cookies).toBeUndefined();
    });

    it('decodes values and removes quotes', () => {
      const { cookies } = withCookieHeader(
        'name=J%C3%BCrg; quoted="a b"; broken=%E0%A4%A',
      );

      expect(cookies?.get('name')?.value).toBe('Jürg');
      expect(cookies?.get('quoted')?.value).toBe('a b');
      expect(cookies?.get('broken')?.value).toBe('%E0%A4%A');
    });

    it('keeps "=" in values', () => {
      expect(withCookieHeader('token=a=b=c').cookies?.get('token')?.value).toBe(
        'a=b=c',
      );
    });

    it('use the first cookie when a name occurs two times', () => {
      const { cookies } = withCookieHeader('a=first; a=second');

      expect(cookies?.get('a')?.value).toBe('first');
      expect(cookies?.getAll()).toHaveLength(2);
    });

    it('ignore parts without a name or without "="', () => {
      const { cookies } = withCookieHeader('=value; flag; ok=1;');
      expect(cookies?.getAll()).toEqual([{ name: 'ok', value: '1' }]);
    });

    it('are read once', () => {
      const request = withCookieHeader('a=1');
      expect(request.cookies).toBe(request.cookies);
    });

    it('can not be modified through getAll', () => {
      const { cookies } = withCookieHeader('a=1');
      cookies?.getAll().pop();
      expect(cookies?.getAll()).toHaveLength(1);
    });
  });

  it('reads nothing until a property is used', () => {
    const init = {
      get headers(): Headers {
        throw new Error('Headers were read');
      },
    };
    expect(() => createFlagsRequest(init)).not.toThrow();
  });

  it('can not be changed', () => {
    const request = createFlagsRequest({});
    expect(Object.isFrozen(request)).toBe(true);
  });

  it('is the same object for each step of a request', async () => {
    const received: (FlagsRequest | undefined)[] = [];
    const connection = defineConnection({
      provider: {
        metadata: { name: 'test' },
        resolveBooleanEvaluation: async () => ({ value: true }),
      },
      project: { platform: 'in-memory' },
      getEvaluationContext: (_context, request) => {
        received.push(request);
        return {};
      },
    });
    const flag = defineFlag({
      key: 'a',
      connection,
      getEvaluationContext: (_context: undefined, request) => {
        received.push(request);
        return undefined;
      },
    });

    await runtime.onInvoke(
      new Request('https://example.com/teams/acme', {
        headers: { cookie: 'user=alice' },
      }),
      () => flag(),
    );
    expect(received[0]).toBe(received[1]);
    expect(received[0]?.url?.pathname).toBe('/teams/acme');
    expect(received[0]?.cookies?.get('user')?.value).toBe('alice');
  });
});

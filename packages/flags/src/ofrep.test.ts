import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { defineConnection } from './connection';
import { defineFlag } from './flag';
import { logger } from './logger';
import { createOfrepProvider } from './ofrep';
import type { Provider } from './types';

/**
 * A fake OFREP server. It records each request and returns the response.
 */
function ofrepServer(respond: () => Response) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} });
      return respond();
    },
  );
  return { fetch, requests };
}

function provider(respond: () => Response) {
  const server = ofrepServer(respond);
  return {
    ...server,
    provider: createOfrepProvider({
      baseUrl: 'https://flags.example.com/',
      headers: () => ({ authorization: 'Bearer token-1' }),
      fetch: server.fetch,
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createOfrepProvider', () => {
  it('is an OpenFeature provider', () => {
    expectTypeOf(
      provider(() => Response.json({})).provider,
    ).toExtend<Provider>();
  });

  it('sends the request of OFREP for one flag', async () => {
    const { provider: ofrep, requests } = provider(() =>
      Response.json({ key: 'new checkout', value: true, reason: 'STATIC' }),
    );

    await ofrep.resolveBooleanEvaluation(
      'new checkout',
      false,
      { user: 'alice' },
      logger,
    );

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe(
      'https://flags.example.com/ofrep/v1/evaluate/flags/new%20checkout',
    );
    expect(request?.init.method).toBe('POST');
    expect(JSON.parse(String(request?.init.body))).toEqual({
      context: { user: 'alice' },
    });
    expect(request?.init.headers).toMatchObject({
      authorization: 'Bearer token-1',
      'content-type': 'application/json',
    });
  });

  it('returns the value, reason, variant and metadata', async () => {
    const { provider: ofrep } = provider(() =>
      Response.json({
        key: 'a',
        value: true,
        reason: 'TARGETING_MATCH',
        variant: 'on',
        metadata: { rule: 'beta-users' },
      }),
    );

    await expect(
      ofrep.resolveBooleanEvaluation('a', false, {}, logger),
    ).resolves.toEqual({
      value: true,
      reason: 'TARGETING_MATCH',
      variant: 'on',
      flagMetadata: { rule: 'beta-users' },
    });
  });

  it('returns the default of the code for a response without value', async () => {
    const { provider: ofrep } = provider(() =>
      Response.json({ key: 'a', reason: 'DEFAULT' }),
    );

    await expect(
      ofrep.resolveBooleanEvaluation('a', true, {}, logger),
    ).resolves.toEqual({ value: true, reason: 'DEFAULT' });
  });

  describe('errors', () => {
    async function resolve(response: Response) {
      return provider(() => response).provider.resolveBooleanEvaluation(
        'a',
        false,
        {},
        logger,
      );
    }

    it('uses the error code of a 400 response', async () => {
      await expect(
        resolve(
          Response.json(
            { key: 'a', errorCode: 'INVALID_CONTEXT', errorDetails: 'No user' },
            { status: 400 },
          ),
        ),
      ).resolves.toMatchObject({
        errorCode: 'INVALID_CONTEXT',
        errorMessage: 'No user',
      });
    });

    it('returns FLAG_NOT_FOUND for a 404 response', async () => {
      await expect(
        resolve(new Response(null, { status: 404 })),
      ).resolves.toMatchObject({ errorCode: 'FLAG_NOT_FOUND' });
    });

    it.each([401, 403])('explains a %i response', async (status) => {
      await expect(
        resolve(new Response(null, { status })),
      ).resolves.toMatchObject({
        errorCode: 'GENERAL',
        errorMessage: `The OFREP server did not accept the credential (status ${status}).`,
      });
    });

    it('returns GENERAL for an error of the server', async () => {
      await expect(
        resolve(Response.json({ errorDetails: 'Oops' }, { status: 500 })),
      ).resolves.toMatchObject({
        errorCode: 'GENERAL',
        errorMessage: 'The OFREP server returned status 500.',
      });
    });

    it('rejects when the server can not be reached', async () => {
      const ofrep = createOfrepProvider({
        baseUrl: 'https://flags.example.com',
        fetch: async () => {
          throw new TypeError('fetch failed');
        },
      });

      await expect(
        ofrep.resolveBooleanEvaluation('a', false, {}, logger),
      ).rejects.toThrow('fetch failed');
    });
  });

  describe('rate limits', () => {
    it('sends no requests until the time of Retry-After', async () => {
      let limited = true;
      const { provider: ofrep, requests } = provider(() =>
        limited
          ? new Response(null, {
              status: 429,
              headers: { 'retry-after': '60' },
            })
          : Response.json({ key: 'a', value: true }),
      );

      await ofrep.resolveBooleanEvaluation('a', false, {}, logger);
      limited = false;
      const result = await ofrep.resolveBooleanEvaluation(
        'a',
        false,
        {},
        logger,
      );

      expect(requests).toHaveLength(1);
      expect(result).toMatchObject({
        errorCode: 'GENERAL',
        errorMessage: expect.stringContaining('allows requests again at'),
      });
    });

    it('sends requests again after the time of Retry-After', async () => {
      vi.useFakeTimers();
      try {
        let limited = true;
        const { provider: ofrep, requests } = provider(() =>
          limited
            ? new Response(null, {
                status: 429,
                headers: {
                  'retry-after': new Date(Date.now() + 5_000).toUTCString(),
                },
              })
            : Response.json({ key: 'a', value: true }),
        );

        await ofrep.resolveBooleanEvaluation('a', false, {}, logger);
        limited = false;
        vi.advanceTimersByTime(6_000);

        await expect(
          ofrep.resolveBooleanEvaluation('a', false, {}, logger),
        ).resolves.toMatchObject({ value: true });
        expect(requests).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('gives values of each type with the same request', async () => {
    const values: Record<string, unknown> = {
      text: 'Sale!',
      count: 10,
      theme: { color: 'red' },
    };
    const ofrep = createOfrepProvider({
      baseUrl: 'https://flags.example.com',
      fetch: async (url) => {
        const key = String(url).split('/').pop() ?? '';
        return Response.json({ key, value: values[key], reason: 'STATIC' });
      },
    });

    await expect(
      ofrep.resolveStringEvaluation('text', '', {}, logger),
    ).resolves.toMatchObject({ value: 'Sale!' });
    await expect(
      ofrep.resolveNumberEvaluation('count', 0, {}, logger),
    ).resolves.toMatchObject({ value: 10 });
    await expect(
      ofrep.resolveObjectEvaluation('theme', {}, {}, logger),
    ).resolves.toMatchObject({ value: { color: 'red' } });
  });

  it('works as the provider of a connection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { provider: ofrep } = provider(() =>
      Response.json({ key: 'new-checkout', value: true, reason: 'STATIC' }),
    );
    const connection = defineConnection({
      provider: ofrep,
      project: { platform: 'in-memory' },
    });

    await expect(
      defineFlag({ key: 'new-checkout', connection })(),
    ).resolves.toBe(true);
  });
});

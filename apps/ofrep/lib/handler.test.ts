import { OFREPProvider } from '@openfeature/ofrep-provider';
import type { DatafileInput, Packed } from '@vercel/flags-core';
import { describe, expect, it, vi } from 'vitest';
import { createDatafileLoader } from './datafile';
import { createHandler } from './handler';
import { options } from './http';

function datafile(): DatafileInput {
  return {
    projectId: 'prj_test',
    environment: 'production',
    definitions: {
      banner: {
        variants: [false, true],
        variantIds: ['off', 'on'],
        environments: {
          production: {
            rules: [
              {
                conditions: [
                  [['user', 'plan'], 'eq' as Packed.Condition[1], 'pro'],
                ],
                outcome: 1,
              },
            ],
            fallthrough: 0,
          },
        },
      },
      paused: { variants: ['blue'], environments: { production: 0 } },
    },
  };
}

function request(
  body: unknown = { context: {} },
  headers: HeadersInit = {},
  query = '',
) {
  return new Request(`https://ofrep.example/ofrep/v1/evaluate/flags${query}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer vf_server_test',
      ...Object.fromEntries(new Headers(headers)),
    },
    body: JSON.stringify(body),
  });
}

function setup(data = datafile()) {
  const fetchData = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(data));
  let time = 1_000_000;
  const load = createDatafileLoader({ fetch: fetchData, now: () => time });
  return {
    fetchData,
    handle: createHandler(load),
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('OFREP evaluations', () => {
  it('passes nested entities to flags-core and returns the variant and standard reason', async () => {
    const { handle } = setup();
    const response = await handle(
      request({ context: { targetingKey: 'u1', user: { plan: 'pro' } } }),
      'banner',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      key: 'banner',
      value: true,
      variant: 'on',
      reason: 'TARGETING_MATCH',
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns all flags and uses DISABLED for paused flags', async () => {
    const response = await setup().handle(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      flags: [
        { key: 'banner', value: false, variant: 'off', reason: 'UNKNOWN' },
        { key: 'paused', value: 'blue', reason: 'DISABLED' },
      ],
    });
  });

  it.each([
    true,
    'value',
    42,
    1.5,
    { nested: [null, 'ok'] },
  ])('returns the supported value %j', async (value) => {
    const data = datafile();
    data.definitions.paused!.variants = [value];
    const response = await setup(data).handle(request(), 'paused');
    expect(response.status).toBe(200);
    expect((await response.json()).value).toEqual(value);
  });

  it.each([
    null,
    [true, false],
  ])('reports unsupported top-level values %j without losing other flags', async (value) => {
    const data = datafile();
    data.definitions.paused!.variants = [value];
    const { handle } = setup(data);
    const single = await handle(request(), 'paused');
    expect(single.status).toBe(500);
    expect(await single.json()).toMatchObject({
      errorDetails: 'The flag value type is not supported by OFREP.',
    });
    const bulk = await handle(request());
    expect(bulk.status).toBe(200);
    expect((await bulk.json()).flags).toEqual([
      expect.objectContaining({ key: 'banner', value: false }),
      expect.objectContaining({ key: 'paused', errorCode: 'GENERAL' }),
    ]);
  });

  it('uses targetingKey for splits without changing the context shape', async () => {
    const data = datafile();
    data.definitions.banner!.environments.production = {
      fallthrough: {
        type: 'split',
        base: ['targetingKey'],
        weights: [0, 100],
        defaultVariant: 0,
      },
    };
    const response = await setup(data).handle(
      request({ context: { targetingKey: 'u1' } }),
      'banner',
    );
    expect(await response.json()).toMatchObject({
      value: true,
      reason: 'SPLIT',
    });
  });

  it('evaluates segments and reused environments', async () => {
    const data = datafile();
    data.segments = { pro: { include: { user: { id: ['u1'] } } } };
    data.definitions.banner!.environments.production = { reuse: 'preview' };
    data.definitions.banner!.environments.preview = {
      rules: [
        {
          conditions: [['segment', 'eq' as Packed.Condition[1], 'pro']],
          outcome: 1,
        },
      ],
      fallthrough: 0,
    };
    const response = await setup(data).handle(
      request({ context: { user: { id: 'u1' } } }),
      'banner',
    );
    expect(await response.json()).toMatchObject({
      value: true,
      reason: 'TARGETING_MATCH',
    });
  });

  it.each([
    'missing',
    '__proto__',
    'constructor',
    'toString',
  ])('returns 404 for absent own key %s', async (key) => {
    const response = await setup().handle(request(), key);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ key, errorCode: 'FLAG_NOT_FOUND' });
  });

  it('isolates broken flag definitions in a bulk result', async () => {
    const data = datafile();
    data.definitions.paused!.environments.production = 100;
    const response = await setup(data).handle(request());
    expect(response.status).toBe(200);
    expect((await response.json()).flags[1]).toMatchObject({
      key: 'paused',
      errorCode: 'GENERAL',
    });
  });

  it('returns an empty flags array for an empty project', async () => {
    const response = await setup({ ...datafile(), definitions: {} }).handle(
      request(),
    );
    expect(await response.json()).toEqual({ flags: [] });
    expect(response.headers.get('etag')).toBeTruthy();
  });
});

describe('request validation', () => {
  it.each([
    null,
    [],
    {},
    { context: null },
    { context: [] },
    { context: 1 },
    { context: { targetingKey: 5 } },
  ])('rejects invalid context %j', async (body) => {
    const { handle, fetchData } = setup();
    const response = await handle(request(body), 'banner');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      key: 'banner',
      errorCode: 'INVALID_CONTEXT',
    });
    expect(fetchData).not.toHaveBeenCalled();
  });

  it('does not include a key on bulk request errors', async () => {
    const response = await setup().handle(request({}));
    expect(await response.json()).toMatchObject({
      errorCode: 'INVALID_CONTEXT',
    });
    expect(
      await setup()
        .handle(request({}))
        .then((r) => r.json()),
    ).not.toHaveProperty('key');
  });

  it.each([
    '{',
    '',
    'x'.repeat(65 * 1024),
  ])('rejects invalid or oversized JSON bodies (%#)', async (body) => {
    const req = new Request('https://ofrep.example', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const response = await setup().handle(req, 'banner');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      key: 'banner',
      errorCode: 'PARSE_ERROR',
    });
  });

  it('requires JSON media type', async () => {
    const response = await setup().handle(
      request({ context: {} }, { 'Content-Type': 'text/plain' }),
    );
    expect(response.status).toBe(400);
  });

  it('supports browser preflight without credentials', () => {
    const response = options();
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toContain(
      'X-API-Key',
    );
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('authentication and cache isolation', () => {
  it('forwards bearer and source project headers only to the fixed data service', async () => {
    const { handle, fetchData } = setup();
    await handle(
      request(
        { context: {} },
        {
          Authorization: 'Bearer caller-oidc-token',
          'X-Vercel-Flags-Project-Id': 'prj_source',
          Cookie: 'secret',
          'X-Vercel-Env': 'preview',
        },
      ),
    );
    expect(fetchData).toHaveBeenCalledWith(
      'https://flags.vercel.com/v1/datafile',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer caller-oidc-token',
          'X-Vercel-Flags-Project-Id': 'prj_source',
          Accept: 'application/json',
        },
        cache: 'no-store',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('accepts X-API-Key authentication', async () => {
    const { handle, fetchData } = setup();
    const req = request();
    req.headers.delete('authorization');
    req.headers.set('x-api-key', 'vf_server_key');
    expect((await handle(req)).status).toBe(200);
    expect(fetchData.mock.calls[0]![1]!.headers).toMatchObject({
      Authorization: 'Bearer vf_server_key',
    });
  });

  it.each([
    '',
    'Basic secret',
    'Bearer',
    'Bearer a b',
  ])('rejects missing or invalid authorization %s', async (authorization) => {
    const { handle, fetchData } = setup();
    const response = await handle(
      request(undefined, { Authorization: authorization }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    expect(fetchData).not.toHaveBeenCalled();
  });

  it('rejects conflicting credential headers', async () => {
    const response = await setup().handle(
      request(undefined, { 'X-API-Key': 'another-key' }),
    );
    expect(response.status).toBe(401);
  });

  it('reuses data for five seconds and separates credentials and source projects', async () => {
    const { handle, fetchData, advance } = setup();
    await handle(request());
    await handle(request(), 'banner');
    expect(fetchData).toHaveBeenCalledTimes(1);
    await handle(request(undefined, { Authorization: 'Bearer other' }));
    await handle(
      request(undefined, { 'X-Vercel-Flags-Project-Id': 'prj_other' }),
    );
    expect(fetchData).toHaveBeenCalledTimes(3);
    advance(5000);
    await handle(request());
    expect(fetchData).toHaveBeenCalledTimes(4);
  });

  it('does not serve cached data beyond the caller JWT expiry', async () => {
    const { handle, fetchData, advance } = setup();
    const token = `header.${Buffer.from(JSON.stringify({ exp: 1002 })).toString('base64url')}.signature`;
    const headers = { Authorization: `Bearer ${token}` };
    expect((await handle(request(undefined, headers))).status).toBe(200);
    advance(2000);
    expect((await handle(request(undefined, headers))).status).toBe(401);
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it('shares concurrent data loads for the same credentials', async () => {
    const { handle, fetchData } = setup();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => handle(request())),
    );
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it('evicts old entries when the cache limit is reached', async () => {
    const { handle, fetchData } = setup();
    for (let n = 0; n < 65; n++)
      await handle(request(undefined, { Authorization: `Bearer token-${n}` }));
    await handle(request(undefined, { Authorization: 'Bearer token-0' }));
    expect(fetchData).toHaveBeenCalledTimes(66);
  });

  it.each([
    401, 403, 429, 500, 503,
  ])('maps upstream status %s without caching a failure', async (status) => {
    const { handle, fetchData } = setup();
    fetchData.mockResolvedValueOnce(
      new Response('upstream secret', {
        status,
        headers: { 'Retry-After': '10' },
      }),
    );
    const response = await handle(request(), 'banner');
    expect(response.status).toBe(status === 503 ? 500 : status);
    expect(await response.text()).not.toContain('upstream secret');
    if (status === 429) expect(response.headers.get('retry-after')).toBe('10');
    expect((await handle(request())).status).toBe(200);
    expect(fetchData).toHaveBeenCalledTimes(2);
  });

  it('does not use stale flags after an authentication failure', async () => {
    const { handle, fetchData, advance } = setup();
    await handle(request());
    advance(5000);
    fetchData.mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await handle(request())).status).toBe(403);
  });

  it.each([
    {},
    { definitions: [] },
    { ...datafile(), environment: null },
  ])('rejects an invalid datafile', async (data) => {
    const { handle, fetchData } = setup();
    fetchData.mockResolvedValueOnce(Response.json(data));
    expect((await handle(request())).status).toBe(500);
  });

  it('sanitizes network errors', async () => {
    const { handle, fetchData } = setup();
    fetchData.mockRejectedValueOnce(new Error('secret token'));
    const response = await handle(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('secret token');
  });
});

describe('bulk ETags', () => {
  it('returns a bodyless 304 for matching, weak, listed, and wildcard tags', async () => {
    const { handle } = setup();
    const response = await handle(request());
    const etag = response.headers.get('etag')!;
    for (const tag of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
      const cached = await handle(request(undefined, { 'If-None-Match': tag }));
      expect(cached.status).toBe(304);
      expect(cached.headers.get('etag')).toBe(etag);
      expect(await cached.text()).toBe('');
    }
  });

  it('returns new results when the context changes the evaluated values', async () => {
    const { handle, fetchData } = setup();
    const previous = await handle(request());
    const response = await handle(
      request(
        { context: { user: { plan: 'pro' } } },
        { 'If-None-Match': previous.headers.get('etag')! },
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).not.toBe(previous.headers.get('etag'));
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it('authenticates before returning a conditional response', async () => {
    const { handle, fetchData } = setup();
    await handle(request());
    fetchData.mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect(
      (
        await handle(
          request(undefined, {
            Authorization: 'Bearer other',
            'If-None-Match': '*',
          }),
        )
      ).status,
    ).toBe(403);
  });

  it.each([
    'flagConfigEtag=new',
    'flagConfigLastModified=2000',
  ])('refreshes the datafile for change metadata %s', async (query) => {
    const { handle, fetchData } = setup();
    await handle(request());
    await handle(request(undefined, {}, `?${query}`));
    expect(fetchData).toHaveBeenCalledTimes(2);
  });
});

describe('official OFREP server provider', () => {
  function providerFor(data = datafile()) {
    const { handle } = setup(data);
    return new OFREPProvider({
      baseUrl: 'https://ofrep.example',
      headers: [['Authorization', 'Bearer vf_server_test']],
      fetchImplementation: async (input, init) => {
        const req = new Request(input, init);
        const path = new URL(req.url).pathname;
        const prefix = '/ofrep/v1/evaluate/flags/';
        expect(path.startsWith(prefix)).toBe(true);
        return handle(req, decodeURIComponent(path.slice(prefix.length)));
      },
    });
  }

  it('reads evaluated booleans, strings, numbers, and objects', async () => {
    const data = datafile();
    data.definitions.count = {
      variants: [42],
      environments: { production: 0 },
    };
    data.definitions.config = {
      variants: [{ enabled: true }],
      environments: { production: 0 },
    };
    const provider = providerFor(data);
    expect(
      await provider.resolveBooleanEvaluation('banner', false, {
        user: { plan: 'pro' },
      }),
    ).toMatchObject({ value: true, reason: 'TARGETING_MATCH', variant: 'on' });
    expect(
      await provider.resolveStringEvaluation('paused', 'default', {}),
    ).toMatchObject({ value: 'blue', reason: 'DISABLED' });
    expect(
      await provider.resolveNumberEvaluation('count', 0, {}),
    ).toMatchObject({ value: 42 });
    expect(
      await provider.resolveObjectEvaluation('config', {}, {}),
    ).toMatchObject({ value: { enabled: true } });
  });

  it('reports FLAG_NOT_FOUND to the caller', async () => {
    const provider = providerFor();
    await expect(
      provider.resolveBooleanEvaluation('missing', false, {}),
    ).resolves.toMatchObject({
      value: false,
      reason: 'ERROR',
      errorCode: 'FLAG_NOT_FOUND',
    });
  });
});

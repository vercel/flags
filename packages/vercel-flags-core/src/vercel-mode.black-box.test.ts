/** Public-API coverage: real client, controller, header source and fetch helper. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BundledDefinitions,
  createClient,
  type FlagsClient,
} from './index.default';
import { setRequestContext } from './test-utils';
import { readBundledDefinitions } from './utils/read-bundled-definitions';

// Only the filesystem boundary is replaced; no controller/source is mocked.
vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(),
}));

const TIMESTAMP = 1_700_000_000_000;
const PROJECT_ID = 'prj_header_test';
const HEADER = 'x-vercel-flags-config-versions';
const SDK_KEY = 'vf_server_header_test';

function datafile(timestamp = TIMESTAMP, enabled = false): BundledDefinitions {
  return {
    definitions: {
      feature: {
        environments: { production: enabled ? 1 : 0 },
        variants: [false, true],
      },
    },
    segments: {},
    projectId: PROJECT_ID,
    environment: 'production',
    configUpdatedAt: timestamp,
    digest: `digest-${timestamp}`,
    revision: timestamp - TIMESTAMP + 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const clients = new Set<FlagsClient>();
const dataFetch = vi.fn<typeof fetch>();
const transport = vi.fn<typeof fetch>();
let cleanupContext = () => {};

function setVersion(timestamp?: number) {
  cleanupContext();
  cleanupContext = setRequestContext(
    timestamp === undefined
      ? {}
      : { [HEADER]: `flags_other=1;flags_${PROJECT_ID}=${timestamp}` },
  );
}

function client(options: Parameters<typeof createClient>[1] = {}) {
  const instance = createClient(SDK_KEY, {
    datafile: datafile(),
    buildStep: false,
    fetch: transport,
    ...options,
  });
  clients.add(instance);
  return instance;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TIMESTAMP);
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.mocked(readBundledDefinitions).mockReset();
  vi.mocked(readBundledDefinitions).mockResolvedValue({
    definitions: null,
    state: 'missing-file',
  });
  dataFetch.mockReset();
  dataFetch.mockRejectedValue(new Error('Unexpected datafile fetch'));
  transport.mockReset();
  transport.mockImplementation((input, init) => {
    const url = String(input);
    if (url === 'https://flags.vercel.com/v1/datafile') {
      return dataFetch(input, init);
    }
    if (url === 'https://flags.vercel.com/v1/ingest') {
      return Promise.resolve(new Response());
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  setVersion(TIMESTAMP);
});

afterEach(async () => {
  try {
    await Promise.all([...clients].map((instance) => instance.shutdown()));
  } finally {
    clients.clear();
    cleanupContext();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});

describe('Vercel mode (black-box)', () => {
  it.each([
    HEADER,
    'flags-config-versions',
  ])('initializes and refreshes using %s', async (headerName) => {
    cleanupContext();
    cleanupContext = setRequestContext({
      [headerName]: `flags_${PROJECT_ID}=${TIMESTAMP}`,
    });
    const instance = client();

    const initial = await instance.evaluate('feature');
    expect(initial.value).toBe(false);
    expect(initial.metrics).toMatchObject({
      mode: 'vercel',
      cacheStatus: 'HIT',
    });
    expect(dataFetch).not.toHaveBeenCalled();

    cleanupContext();
    cleanupContext = setRequestContext({
      [headerName]: `flags_${PROJECT_ID}=${TIMESTAMP + 20_000}`,
    });
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP + 20_000, true)),
    );

    vi.setSystemTime(TIMESTAMP + 10_001);
    const refreshed = await instance.evaluate('feature');
    expect(refreshed.value).toBe(true);
    expect(refreshed.metrics).toMatchObject({
      mode: 'vercel',
      source: 'remote',
      cacheStatus: 'MISS',
    });
    expect(dataFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('uses fresh %s definitions without opening a stream or polling', async (origin) => {
    const bundled = datafile();
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      definitions: bundled,
      state: 'ok',
    });
    const instance = client({
      datafile: origin === 'provided' ? bundled : undefined,
    });
    await instance.initialize();

    const result = await instance.evaluate('feature');

    expect(result.value).toBe(false);
    expect(result.metrics).toMatchObject({
      mode: 'vercel',
      source: origin === 'provided' ? 'in-memory' : 'embedded',
      cacheStatus: 'HIT',
      connectionState: 'disconnected',
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(dataFetch).not.toHaveBeenCalled();
    expect(
      transport.mock.calls.every(([url]) => String(url).endsWith('/v1/ingest')),
    ).toBe(true);
  });

  it.each([
    undefined,
    'flags_other=1700000000000',
    `flags_${PROJECT_ID}=invalid`,
  ])('keeps the configured offline fallback when the matching header is unavailable: %s', async (header) => {
    cleanupContext();
    cleanupContext = setRequestContext(header ? { [HEADER]: header } : {});
    const instance = client({ stream: false, polling: false });

    const result = await instance.evaluate('feature');

    expect(result.value).toBe(false);
    expect(result.metrics).toMatchObject({
      mode: 'offline',
      cacheStatus: 'STALE',
    });
    expect(dataFetch).not.toHaveBeenCalled();
  });

  it('does not enable runtime header refresh during a build', async () => {
    setVersion(TIMESTAMP + 20_000);
    const instance = client({ buildStep: true });

    const result = await instance.evaluate('feature');

    expect(result.value).toBe(false);
    expect(result.metrics?.mode).toBe('build');
    expect(dataFetch).not.toHaveBeenCalled();
  });

  it.each([
    1, 10_000,
  ])('serves stale data immediately at delta %i ms, then exposes the background update', async (delta) => {
    setVersion(TIMESTAMP + delta);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    const instance = client();
    setVersion(TIMESTAMP);
    await instance.evaluate('feature');
    setVersion(TIMESTAMP + delta);

    const first = await instance.evaluate('feature');
    expect(first.value).toBe(false);
    expect(first.metrics).toMatchObject({
      mode: 'vercel',
      cacheStatus: 'STALE',
    });
    expect(dataFetch).toHaveBeenCalledTimes(1);
    expect((await instance.evaluate('feature')).value).toBe(false);
    expect(dataFetch).toHaveBeenCalledTimes(1);

    pending.resolve(Response.json(datafile(TIMESTAMP + delta, true)));
    await vi.advanceTimersByTimeAsync(0);
    const second = await instance.evaluate('feature');

    expect(second.value).toBe(true);
    expect(second.metrics).toMatchObject({
      source: 'remote',
      cacheStatus: 'HIT',
    });
    expect((await instance.getDatafile()).configUpdatedAt).toBe(
      TIMESTAMP + delta,
    );
    expect(dataFetch).toHaveBeenCalledTimes(1);
  });

  it('blocks for unknown freshness and shares one fetch across evaluate and bulkEvaluate', async () => {
    setVersion(TIMESTAMP + 10_001);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    const instance = client();
    const settled = vi.fn();
    const single = instance.evaluate('feature').then((result) => {
      settled();
      return result;
    });
    const bulk = instance.bulkEvaluate([
      { key: 'feature', defaultValue: false },
    ]);
    await vi.advanceTimersByTimeAsync(0);

    expect(settled).not.toHaveBeenCalled();
    expect(dataFetch).toHaveBeenCalledTimes(1);
    expect(dataFetch).toHaveBeenCalledWith(
      'https://flags.vercel.com/v1/datafile',
      {
        headers: expect.objectContaining({
          Authorization: `Bearer ${SDK_KEY}`,
          'X-Vercel-Env': 'production',
        }),
        signal: expect.any(AbortSignal),
      },
    );
    pending.resolve(Response.json(datafile(TIMESTAMP + 10_001, true)));
    const [result, results] = await Promise.all([single, bulk]);

    for (const evaluation of [result, results.feature]) {
      expect(evaluation?.value).toBe(true);
      expect(evaluation?.metrics).toMatchObject({
        mode: 'vercel',
        source: 'remote',
        cacheStatus: 'MISS',
      });
    }
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'HIT',
    );
    expect(dataFetch).toHaveBeenCalledTimes(1);
  });

  it('rechecks new request versions instead of caching the first HIT forever', async () => {
    const instance = client();
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'HIT',
    );

    setVersion(TIMESTAMP + 20_000);
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP + 20_000, true)),
    );
    vi.setSystemTime(TIMESTAMP + 10_001);
    const second = await instance.evaluate('feature');
    expect(second.value).toBe(true);
    expect(second.metrics?.cacheStatus).toBe('MISS');

    setVersion(TIMESTAMP + 40_000);
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP + 40_000, false)),
    );
    vi.setSystemTime(TIMESTAMP + 20_002);
    const third = await instance.evaluate('feature');
    expect(third.value).toBe(false);
    expect(third.metrics?.cacheStatus).toBe('MISS');
    expect(dataFetch).toHaveBeenCalledTimes(2);

    setVersion();
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'STALE',
    );
    expect(dataFetch).toHaveBeenCalledTimes(2);
  });

  it('does not make a fresh request wait on another requests blocking refresh', async () => {
    const instance = client();
    await instance.initialize();
    setVersion(TIMESTAMP + 20_000);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    const blocking = instance.evaluate('feature');
    await vi.advanceTimersByTimeAsync(0);

    setVersion(TIMESTAMP);
    const hitSettled = vi.fn();
    const hit = instance.evaluate('feature').then((result) => {
      hitSettled(result);
      return result;
    });
    await vi.advanceTimersByTimeAsync(0);
    // Settle the transport even when the independence assertion fails.
    const completedBeforeFetch = hitSettled.mock.calls.length;
    pending.resolve(Response.json(datafile(TIMESTAMP + 20_000, true)));
    const [blockingResult, hitResult] = await Promise.all([blocking, hit]);

    expect(completedBeforeFetch).toBe(1);
    expect(hitResult.value).toBe(false);
    expect(hitResult.metrics?.cacheStatus).toBe('HIT');
    expect(blockingResult.value).toBe(true);
    expect(dataFetch).toHaveBeenCalledTimes(1);
  });

  it('retries a failed blocking refresh instead of poisoning subsequent evaluations', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setVersion(TIMESTAMP + 20_000);
    dataFetch.mockResolvedValueOnce(
      new Response(null, { status: 503, statusText: 'Service Unavailable' }),
    );
    const instance = client();

    const failed = await instance.evaluate('feature', false);
    expect(failed.value).toBe(false);
    expect(failed.reason).toBe('error');
    expect(failed.errorMessage).toContain('Service Unavailable');
    expect(errorSpy).not.toHaveBeenCalled();

    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP + 20_000, true)),
    );
    const recovered = await instance.evaluate('feature');
    expect(recovered.value).toBe(true);
    expect(recovered.metrics?.cacheStatus).toBe('MISS');
    expect(dataFetch).toHaveBeenCalledTimes(2);
  });

  it('contains background fetch errors and retries without losing cached data', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setVersion(TIMESTAMP + 1);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    const instance = client();
    setVersion(TIMESTAMP);
    await instance.evaluate('feature');
    setVersion(TIMESTAMP + 1);

    expect((await instance.evaluate('feature')).value).toBe(false);

    const failure = new Error('Network unavailable');
    pending.reject(failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Header refresh failed:',
      failure,
    );
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP + 1, true)),
    );
    expect((await instance.evaluate('feature')).value).toBe(false);
    await vi.advanceTimersByTimeAsync(0);

    expect((await instance.evaluate('feature')).value).toBe(true);
    expect(dataFetch).toHaveBeenCalledTimes(2);
  });

  it('aborts an in-flight header refresh on shutdown', async () => {
    setVersion(TIMESTAMP + 1);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    const instance = client();
    setVersion(TIMESTAMP);
    await instance.evaluate('feature');
    setVersion(TIMESTAMP + 1);

    await instance.evaluate('feature');
    const signal = dataFetch.mock.calls[0]?.[1]?.signal;

    await instance.shutdown();
    clients.delete(instance);
    pending.resolve(Response.json(datafile(TIMESTAMP + 1, true)));
    await vi.advanceTimersByTimeAsync(0);

    expect(signal?.aborted).toBe(true);
  });

  it.each([
    1, 100_000,
  ])('uses elapsed freshness at 10s and awaits the pending refresh after expiry (version delta %i)', async (delta) => {
    const waitUntil = vi.fn();
    const instance = client({ waitUntil, disableMetrics: true });
    await instance.evaluate('feature');
    waitUntil.mockClear();
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    setVersion(TIMESTAMP + delta);
    vi.setSystemTime(TIMESTAMP + 10_000);
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'STALE',
    );
    expect(waitUntil).toHaveBeenCalledTimes(1);
    const lifetime = waitUntil.mock.calls[0]?.[0] as Promise<unknown>;
    const lifetimeSettled = vi.fn();
    void lifetime.then(lifetimeSettled);
    vi.setSystemTime(TIMESTAMP + 10_001);
    const settled = vi.fn();
    const blocking = instance.evaluate('feature').then((result) => {
      settled();
      return result;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    expect(lifetimeSettled).not.toHaveBeenCalled();
    expect(dataFetch).toHaveBeenCalledTimes(1);
    pending.resolve(Response.json(datafile(TIMESTAMP + delta, true)));
    expect((await blocking).metrics?.cacheStatus).toBe('MISS');
    await lifetime;
    expect(lifetimeSettled).toHaveBeenCalledTimes(1);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('blocks on the first invalidation of unknown-age %s data', async (origin) => {
    const input = datafile();
    const original = structuredClone(input);
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      definitions: input,
      state: 'ok',
    });
    const instance = client({
      datafile: origin === 'provided' ? input : undefined,
    });
    setVersion(TIMESTAMP + 1);
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP + 1, true)),
    );
    const result = await instance.evaluate('feature');
    expect(result.value).toBe(true);
    expect(result.metrics?.cacheStatus).toBe('MISS');
    expect(input).toEqual({
      ...original,
      _origin: origin,
      _fetchedAt: undefined,
    });
    expect(Object.keys(await instance.getDatafile()).sort()).toEqual(
      [...Object.keys(original), 'metrics'].sort(),
    );
  });

  it.each([
    'older',
    'missing',
    'malformed',
    'newer',
  ] as const)('does not renew freshness for %s headers', async (kind) => {
    const instance = client();
    await instance.evaluate('feature');
    vi.setSystemTime(TIMESTAMP + 9_000);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    if (kind === 'malformed') {
      cleanupContext();
      cleanupContext = setRequestContext({
        [HEADER]: `flags_${PROJECT_ID}=invalid`,
      });
    } else {
      setVersion(
        kind === 'missing'
          ? undefined
          : TIMESTAMP + (kind === 'older' ? -1 : 1),
      );
    }
    await instance.evaluate('feature');
    vi.setSystemTime(TIMESTAMP + 10_001);
    setVersion(TIMESTAMP + 1);
    const settled = vi.fn();
    const blocking = instance.evaluate('feature').then((result) => {
      settled();
      return result;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    expect(dataFetch).toHaveBeenCalledTimes(1);
    pending.resolve(Response.json(datafile(TIMESTAMP + 1, true)));
    expect((await blocking).metrics?.cacheStatus).toBe('MISS');
  });

  it('renews matching-header freshness and takes the maximum with fetched freshness', async () => {
    const instance = client();
    setVersion(TIMESTAMP + 1);
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP + 1, true)),
    );
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'MISS',
    );
    vi.setSystemTime(TIMESTAMP + 9_000);
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'HIT',
    );
    vi.setSystemTime(TIMESTAMP + 19_000);
    setVersion(TIMESTAMP + 100_000);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'STALE',
    );
    pending.resolve(Response.json(datafile(TIMESTAMP + 1, false)));
    await vi.advanceTimersByTimeAsync(0);
    // Same-version responses replace the cached data and renew fetched freshness.
    expect((await instance.getDatafile()).definitions).toEqual(
      datafile(TIMESTAMP + 1, false).definitions,
    );
    vi.setSystemTime(TIMESTAMP + 29_000);
    const next = deferred<Response>();
    dataFetch.mockReturnValueOnce(next.promise);
    const result = await instance.evaluate('feature');
    expect(result.value).toBe(false);
    expect(result.metrics?.cacheStatus).toBe('STALE');
    next.resolve(Response.json(datafile(TIMESTAMP + 100_000, false)));
    await vi.advanceTimersByTimeAsync(0);
    expect(dataFetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('does not share confirmation across clients using the same %s object', async (origin) => {
    const input = datafile();
    const original = structuredClone(input);
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      definitions: input,
      state: 'ok',
    });
    const options = { datafile: origin === 'provided' ? input : undefined };
    const first = client(options);
    const second = client(options);
    await first.evaluate('feature');
    setVersion(TIMESTAMP + 1);
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP + 1, true)),
    );
    expect((await second.evaluate('feature')).metrics?.cacheStatus).toBe(
      'MISS',
    );
    expect(input).toEqual({
      ...original,
      _origin: origin,
      _fetchedAt: undefined,
    });
    expect(input).not.toHaveProperty('_lastSeen');
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    expect((await first.evaluate('feature')).metrics?.cacheStatus).toBe(
      'STALE',
    );
    pending.resolve(Response.json(datafile(TIMESTAMP + 1, true)));
    await vi.advanceTimersByTimeAsync(0);
  });

  it('does not extend freshness after a failed background response', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const instance = client();
    await instance.evaluate('feature');
    vi.setSystemTime(TIMESTAMP + 9_000);
    setVersion(TIMESTAMP + 1);
    dataFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'STALE',
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Header refresh failed:',
      expect.any(Error),
    );
    expect((await instance.getDatafile()).configUpdatedAt).toBe(TIMESTAMP);
    vi.setSystemTime(TIMESTAMP + 10_001);
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP + 1, true)),
    );
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'MISS',
    );
    expect(dataFetch).toHaveBeenCalledTimes(2);
  });

  it('replaces cached data and renews freshness after an older background response', async () => {
    const instance = client();
    await instance.evaluate('feature');
    vi.setSystemTime(TIMESTAMP + 9_000);
    setVersion(TIMESTAMP + 1);
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP - 1, true)),
    );
    const stale = await instance.evaluate('feature');
    expect(stale.value).toBe(false);
    expect(stale.metrics?.cacheStatus).toBe('STALE');
    await vi.advanceTimersByTimeAsync(0);
    const cached = await instance.getDatafile();
    expect(cached.configUpdatedAt).toBe(TIMESTAMP - 1);
    expect(cached.definitions).toEqual(
      datafile(TIMESTAMP - 1, true).definitions,
    );

    vi.setSystemTime(TIMESTAMP + 19_000);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    const boundary = await instance.evaluate('feature');
    expect(boundary.value).toBe(true);
    expect(boundary.metrics?.cacheStatus).toBe('STALE');
    vi.setSystemTime(TIMESTAMP + 19_001);
    const settled = vi.fn();
    const blocking = instance.evaluate('feature').then((result) => {
      settled();
      return result;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    expect(dataFetch).toHaveBeenCalledTimes(2);
    pending.resolve(Response.json(datafile(TIMESTAMP + 1, false)));
    const refreshed = await blocking;
    expect(refreshed.value).toBe(false);
    expect(refreshed.metrics?.cacheStatus).toBe('MISS');
    expect((await instance.getDatafile()).configUpdatedAt).toBe(TIMESTAMP + 1);
    expect(dataFetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    0, -1,
  ])('retains fetched freshness through cache reads and blocking revalidation with version delta %i', async (delta) => {
    const instance = client();
    setVersion(TIMESTAMP + 1);
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP + 1, true)),
    );
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'MISS',
    );
    vi.setSystemTime(TIMESTAMP + 9_999);
    // An older header reads the cache without confirming its version.
    setVersion(TIMESTAMP);
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect((await instance.getDatafile()).configUpdatedAt).toBe(TIMESTAMP + 1);
    vi.setSystemTime(TIMESTAMP + 10_001);
    setVersion(TIMESTAMP + 2);
    const responseVersion = TIMESTAMP + 1 + delta;
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(responseVersion, false)),
    );
    const revalidated = await instance.evaluate('feature');
    expect(revalidated.value).toBe(false);
    expect(revalidated.metrics?.cacheStatus).toBe('MISS');
    const cached = await instance.getDatafile();
    expect(cached.configUpdatedAt).toBe(responseVersion);
    expect(cached.definitions).toEqual(
      datafile(responseVersion, false).definitions,
    );
    vi.setSystemTime(TIMESTAMP + 20_001);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'STALE',
    );
    pending.resolve(Response.json(datafile(TIMESTAMP + 2, false)));
    await vi.advanceTimersByTimeAsync(0);
    expect(dataFetch).toHaveBeenCalledTimes(3);
    const visible = await instance.getDatafile();
    expect(visible).not.toHaveProperty('_origin');
    expect(visible).not.toHaveProperty('_fetchedAt');
    expect(visible).not.toHaveProperty('_lastSeen');
  });

  it('serves stale and finishes the refresh when waitUntil registration throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const waitUntil = vi.fn(() => {
      throw new Error('No request lifetime available');
    });
    const instance = client({ waitUntil });
    await instance.evaluate('feature');
    waitUntil.mockClear();
    setVersion(TIMESTAMP + 1);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);

    const stale = await instance.evaluate('feature');
    expect(stale.value).toBe(false);
    expect(stale.reason).not.toBe('error');
    expect(stale.metrics?.cacheStatus).toBe('STALE');
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    expect(dataFetch).toHaveBeenCalledTimes(1);

    pending.resolve(Response.json(datafile(TIMESTAMP + 1, true)));
    await vi.advanceTimersByTimeAsync(0);
    const refreshed = await instance.evaluate('feature');
    expect(refreshed.value).toBe(true);
    expect(refreshed.metrics?.cacheStatus).toBe('HIT');
    expect(dataFetch).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('reports vercel mode in config-read telemetry', async () => {
    const instance = client();
    await instance.evaluate('feature');
    await instance.shutdown();
    clients.delete(instance);

    const events = transport.mock.calls
      .filter(([url]) => String(url).endsWith('/v1/ingest'))
      .flatMap(([, init]) => JSON.parse(String(init?.body)));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'FLAGS_CONFIG_READ',
          payload: expect.objectContaining({
            mode: 'vercel',
            configUpdatedAt: TIMESTAMP,
            cacheAction: 'NONE',
          }),
        }),
      ]),
    );
  });
});

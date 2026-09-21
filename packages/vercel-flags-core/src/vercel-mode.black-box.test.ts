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
    vi.unstubAllEnvs();
  }
});

describe('Vercel mode (black-box)', () => {
  it('refreshes acquisition metadata when polling reacquires the same version', async () => {
    setVersion();
    const original = { ...datafile(), fetchedAt: TIMESTAMP - 60_000 };
    dataFetch.mockImplementation(async () =>
      Response.json({ ...datafile(), fetchedAt: 1 }),
    );
    const instance = client({
      datafile: original,
      stream: false,
      polling: true,
    });
    await instance.initialize();
    expect((await instance.getDatafile()).fetchedAt).toBe(TIMESTAMP);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await instance.getDatafile()).fetchedAt).toBe(TIMESTAMP + 30_000);
    expect(dataFetch).toHaveBeenCalledTimes(2);
    // An older response must not refresh either definitions or their age.
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP - 1, true)),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await instance.getDatafile()).fetchedAt).toBe(TIMESTAMP + 30_000);
    expect((await instance.evaluate('feature')).value).toBe(false);
  });

  it.each([
    undefined,
    TIMESTAMP - 10_001,
    NaN,
    Infinity,
    -1,
    0,
    TIMESTAMP + 1,
  ])('blocks for legacy or invalid acquisition time %s even for a tiny config change', async (fetchedAt) => {
    setVersion(TIMESTAMP + 1);
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      definitions: { ...datafile(), fetchedAt },
      state: 'ok',
    });
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    const instance = client({ datafile: undefined });
    const settled = vi.fn();
    const read = instance.evaluate('feature').then((result) => {
      settled();
      return result;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    expect((await instance.getDatafile()).fetchedAt).toBe(fetchedAt);
    pending.resolve(Response.json(datafile(TIMESTAMP + 1, true)));
    expect((await read).value).toBe(true);
    expect((await instance.getDatafile()).fetchedAt).toBe(TIMESTAMP);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('preserves %s metadata and confirms freshness without changing fetchedAt', async (origin) => {
    const embedded = { ...datafile(), fetchedAt: TIMESTAMP - 60_000 };
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      definitions: embedded,
      state: 'ok',
    });
    const instance = client({
      datafile: origin === 'provided' ? embedded : undefined,
    });
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'HIT',
    );
    expect((await instance.getDatafile()).fetchedAt).toBe(embedded.fetchedAt);
    expect((await instance.getFallbackDatafile()).fetchedAt).toBe(
      embedded.fetchedAt,
    );
    vi.setSystemTime(TIMESTAMP + 10_000);
    setVersion(TIMESTAMP + 60_000);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'STALE',
    );
    expect((await instance.getDatafile()).fetchedAt).toBe(embedded.fetchedAt);
    pending.resolve(
      Response.json({ ...datafile(TIMESTAMP + 60_000, true), fetchedAt: 1 }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.getDatafile()).fetchedAt).toBe(TIMESTAMP + 10_000);
  });

  it('keeps matching-header confirmations local to each project client', async () => {
    const first = client();
    expect((await first.evaluate('feature')).metrics?.cacheStatus).toBe('HIT');
    const second = client({
      datafile: { ...datafile(), projectId: 'prj_other' },
    });
    cleanupContext();
    cleanupContext = setRequestContext({
      [HEADER]: `flags_prj_other=${TIMESTAMP + 1}`,
    });
    dataFetch.mockResolvedValueOnce(
      Response.json({
        ...datafile(TIMESTAMP + 1, true),
        projectId: 'prj_other',
      }),
    );
    const result = await second.evaluate('feature');
    expect(result.value).toBe(true);
    expect(result.metrics?.cacheStatus).toBe('MISS');
  });

  it('does not treat an older header as confirmation', async () => {
    setVersion(TIMESTAMP - 1);
    const instance = client();
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'HIT',
    );
    setVersion(TIMESTAMP + 1);
    dataFetch.mockResolvedValueOnce(
      Response.json(datafile(TIMESTAMP + 1, true)),
    );
    const result = await instance.evaluate('feature');
    expect(result.value).toBe(true);
    expect(result.metrics?.cacheStatus).toBe('MISS');
  });

  it('uses a recent runtime acquisition even when config versions are far apart', async () => {
    setVersion();
    dataFetch.mockResolvedValueOnce(
      Response.json({ ...datafile(), fetchedAt: 1 }),
    );
    const instance = client({
      datafile: undefined,
      stream: false,
      polling: false,
    });
    expect((await instance.getDatafile()).fetchedAt).toBe(TIMESTAMP);
    setVersion(TIMESTAMP + 60_000);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'STALE',
    );
    pending.resolve(Response.json(datafile(TIMESTAMP + 60_000, true)));
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.getDatafile()).fetchedAt).toBe(TIMESTAMP);
  });

  it('does not carry a previous version confirmation to its replacement', async () => {
    setVersion(TIMESTAMP + 1);
    const instance = client();
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    const blocking = instance.evaluate('feature');
    await vi.advanceTimersByTimeAsync(0);
    setVersion(TIMESTAMP);
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'HIT',
    );
    // Simulate a clock correction: the old confirmation is later than the
    // acquisition of the replacement. Only the replacement's age may be used.
    vi.setSystemTime(TIMESTAMP - 5_000);
    pending.resolve(Response.json(datafile(TIMESTAMP + 1, true)));
    await blocking;
    vi.setSystemTime(TIMESTAMP + 5_001);
    setVersion(TIMESTAMP + 2);
    dataFetch.mockResolvedValueOnce(Response.json(datafile(TIMESTAMP + 2)));
    expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
      'MISS',
    );
    expect(dataFetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    undefined,
    NaN,
    Infinity,
    '',
    'invalid',
    0,
    -1,
  ])('ignores invalid or missing config timestamp %s', async (configUpdatedAt) => {
    const instance = client({
      datafile: { ...datafile(), configUpdatedAt },
      stream: false,
      polling: false,
    });
    expect((await instance.evaluate('feature')).value).toBe(false);
    expect(dataFetch).not.toHaveBeenCalled();
  });

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
  ])('serves stale data acquired %i ms ago, then exposes the background update', async (delta) => {
    setVersion(TIMESTAMP + delta);
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    const instance = client({
      datafile: { ...datafile(), fetchedAt: TIMESTAMP - delta },
    });

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

  it('blocks beyond the 10-second boundary and shares one fetch across evaluate and bulkEvaluate', async () => {
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
    setVersion(TIMESTAMP + 20_000);
    dataFetch.mockResolvedValueOnce(
      new Response(null, { status: 503, statusText: 'Service Unavailable' }),
    );
    const instance = client();

    const failed = await instance.evaluate('feature', false);
    expect(failed.value).toBe(false);
    expect(failed.reason).toBe('error');
    expect(failed.errorMessage).toContain('Service Unavailable');

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
    const instance = client({
      datafile: { ...datafile(), fetchedAt: TIMESTAMP },
    });
    expect((await instance.evaluate('feature')).value).toBe(false);

    const error = new Error('Network unavailable');
    pending.reject(error);
    await vi.advanceTimersByTimeAsync(0);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Header refresh failed:',
      error,
    );
    errorSpy.mockRestore();
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
    const instance = client({
      datafile: { ...datafile(), fetchedAt: TIMESTAMP },
    });
    await instance.evaluate('feature');
    const signal = dataFetch.mock.calls[0]?.[1]?.signal;

    await instance.shutdown();
    clients.delete(instance);
    pending.resolve(Response.json(datafile(TIMESTAMP + 1, true)));
    await vi.advanceTimersByTimeAsync(0);

    expect(signal?.aborted).toBe(true);
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

import { AsyncLocalStorage } from 'node:async_hooks';
import { waitUntil } from '@vercel/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from './index.default';
import type { BundledDefinitions, DatafileInput, FlagsClient } from './types';
import { readBundledDefinitions } from './utils/read-bundled-definitions';

vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }));
vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(),
}));
vi.mock('./lib/report-value', () => ({ internalReportValue: vi.fn() }));

const context = new AsyncLocalStorage<{ headers: Record<string, string> }>();
const symbol = Symbol.for('@vercel/request-context');
const clients: FlagsClient[] = [];
const fetchMock = vi.fn<typeof fetch>();
const datafileFetch = vi.fn<typeof fetch>();
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

function data(configUpdatedAt = 1000, value = true): BundledDefinitions {
  return {
    projectId: 'prj_123',
    environment: 'production',
    configUpdatedAt,
    digest: String(configUpdatedAt),
    revision: configUpdatedAt,
    definitions: {
      flagA: {
        environments: { production: value ? 1 : 0 },
        variants: [false, true],
      },
    },
    segments: {},
  };
}

function client(options: Parameters<typeof createClient>[1] = {}) {
  const result = createClient('vf_server_fake', {
    buildStep: false,
    datafile: data(),
    fetch: fetchMock,
    ...options,
  });
  clients.push(result);
  return result;
}

function request<T>(version: number | undefined, fn: () => T): T {
  return headers(
    version === undefined
      ? {}
      : { 'x-vercel-edge-config-versions': `flags_prj_123=${version}` },
    fn,
  );
}

function headers<T>(value: Record<string, string>, fn: () => T): T {
  return context.run({ headers: { host: 'example.com', ...value } }, fn);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function configCalls() {
  return fetchMock.mock.calls.filter(
    ([url]) => !url.toString().includes('/v1/ingest'),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  vi.mocked(waitUntil).mockReset();
  vi.mocked(readBundledDefinitions)
    .mockReset()
    .mockResolvedValue({ definitions: null, state: 'missing-file' });
  datafileFetch
    .mockReset()
    .mockImplementation(() => Promise.resolve(Response.json(data())));
  fetchMock.mockReset().mockImplementation((url, init) => {
    if (url.toString().endsWith('/v1/ingest'))
      return Promise.resolve(new Response());
    if (url.toString().endsWith('/v1/datafile'))
      return datafileFetch(url, init);
    if (url.toString().endsWith('/v1/stream')) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `${JSON.stringify({ type: 'primed', revision: 1000, projectId: 'prj_123', environment: 'production' })}\n`,
            ),
          );
        },
      });
      return Promise.resolve(new Response(body));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
  Object.defineProperty(globalThis, symbol, {
    configurable: true,
    value: { get: () => context.getStore() },
  });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.shutdown()));
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  Reflect.deleteProperty(globalThis, symbol);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('pushVersion', () => {
  it.each([
    0, 999, 1000,
  ])('does no config-network work when local data covers %s', async (version) => {
    const c = client();
    await request(version, () => c.initialize());
    const result = await request(version, () => c.getDatafile());
    expect(result.configUpdatedAt).toBe(1000);
    expect(result.metrics).toMatchObject({
      mode: 'pushVersion',
      cacheStatus: 'HIT',
      connectionState: 'disconnected',
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(configCalls()).toHaveLength(0);
  });

  it.each([
    1, 9999,
  ])('returns cached data and defers a fetch for a %s ms version gap', async (gap) => {
    const c = client();
    datafileFetch.mockImplementation(() =>
      Promise.resolve(Response.json(data(1000 + gap, false))),
    );
    const result = await request(1000 + gap, () => c.getDatafile());
    expect(result.configUpdatedAt).toBe(1000);
    expect(result.metrics).toMatchObject({
      mode: 'pushVersion',
      cacheStatus: 'STALE',
    });
    expect(configCalls()).toHaveLength(0);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    const background = vi.mocked(waitUntil).mock.calls[0]![0];
    await vi.advanceTimersByTimeAsync(0);
    await background;
    expect(configCalls()).toHaveLength(1);
    expect(datafileFetch).toHaveBeenCalledWith(
      'https://flags.vercel.com/v1/datafile',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Config-Min-Updated-At': String(1000 + gap),
        }),
      }),
    );
    const updated = await request(1000 + gap, () => c.getDatafile());
    expect(updated.configUpdatedAt).toBe(1000 + gap);
    expect(updated.metrics.cacheStatus).toBe('HIT');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(configCalls()).toHaveLength(1);
  });

  it.each([10_000, 10_001])('blocks at a version gap of %s ms', async (gap) => {
    const c = client();
    const response = deferred<Response>();
    datafileFetch.mockReturnValue(response.promise);
    let settled = false;
    const read = request(1000 + gap, () => c.getDatafile()).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    expect(configCalls()).toHaveLength(1);
    response.resolve(Response.json(data(1000 + gap, false)));
    const result = await read;
    expect(result.configUpdatedAt).toBe(1000 + gap);
    expect(result.metrics).toMatchObject({
      mode: 'pushVersion',
      cacheStatus: 'MISS',
    });
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('uses the version gap, not wall-clock age', async () => {
    vi.setSystemTime(new Date('2030-01-01'));
    const c = client();
    const response = deferred<Response>();
    datafileFetch.mockReturnValue(response.promise);
    expect((await request(1001, () => c.getDatafile())).configUpdatedAt).toBe(
      1000,
    );
    expect(configCalls()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(0);
    response.resolve(Response.json(data(1001)));
    await vi.mocked(waitUntil).mock.calls[0]![0];
  });

  it('shares scheduled and in-flight refreshes across requests and bulk/single evaluation', async () => {
    const c = client();
    await request(1000, () => c.initialize());
    const response = deferred<Response>();
    datafileFetch.mockReturnValue(response.promise);
    const initial = await Promise.all([
      request(1001, () => c.evaluate('flagA')),
      request(1001, () => c.bulkEvaluate([{ key: 'flagA' }])),
      request(1001, () => c.getDatafile()),
    ]);
    expect(initial[0].value).toBe(true);
    expect(initial[1].flagA).toMatchObject({ value: true });
    expect(configCalls()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(0);
    await request(1001, () => c.getDatafile());
    expect(configCalls()).toHaveLength(1);
    response.resolve(Response.json(data(1001, false)));
    await vi.advanceTimersByTimeAsync(0);
    expect((await request(1001, () => c.evaluate('flagA'))).value).toBe(false);
    expect(
      (await request(1001, () => c.bulkEvaluate([{ key: 'flagA' }]))).flagA,
    ).toMatchObject({ value: false });
    expect(configCalls()).toHaveLength(1);
  });

  it('promotes a scheduled background fetch when a blocking reader arrives', async () => {
    const c = client();
    await request(1001, () => c.getDatafile());
    const response = deferred<Response>();
    datafileFetch.mockReturnValue(response.promise);
    const read = request(20_000, () => c.getDatafile());
    await vi.advanceTimersByTimeAsync(0);
    expect(configCalls()).toHaveLength(1);
    expect(datafileFetch.mock.calls[0]![1]?.headers).toMatchObject({
      'X-Config-Min-Updated-At': '20000',
    });
    response.resolve(Response.json(data(20_000)));
    expect((await read).configUpdatedAt).toBe(20_000);
  });

  it('follows an older in-flight fetch with the newer blocking minimum', async () => {
    const c = client();
    const first = deferred<Response>();
    const second = deferred<Response>();
    datafileFetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    await request(1001, () => c.getDatafile());
    await vi.advanceTimersByTimeAsync(0);
    const reads = Promise.all(
      Array.from({ length: 5 }, () => request(20_000, () => c.getDatafile())),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(configCalls()).toHaveLength(1);
    first.resolve(Response.json(data(1001)));
    await vi.advanceTimersByTimeAsync(0);
    expect(configCalls()).toHaveLength(2);
    expect(datafileFetch.mock.calls[1]![1]?.headers).toMatchObject({
      'X-Config-Min-Updated-At': '20000',
    });
    second.resolve(Response.json(data(20_000)));
    expect((await reads).map((r) => r.configUpdatedAt)).toEqual(
      Array(5).fill(20_000),
    );
    expect(configCalls()).toHaveLength(2);
  });

  it('keeps a newer background minimum alive when following an older fetch', async () => {
    const c = client();
    const first = deferred<Response>();
    const second = deferred<Response>();
    datafileFetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    await request(1001, () => c.getDatafile());
    await vi.advanceTimersByTimeAsync(0);
    await request(1002, () => c.getDatafile());
    const followup = vi.mocked(waitUntil).mock.calls[1]![0];
    first.resolve(Response.json(data(1001)));
    await vi.advanceTimersByTimeAsync(1);
    expect(configCalls()).toHaveLength(2);
    expect(datafileFetch.mock.calls[1]![1]?.headers).toMatchObject({
      'X-Config-Min-Updated-At': '1002',
    });
    second.resolve(Response.json(data(1002)));
    await followup;
    expect((await request(1002, () => c.getDatafile())).configUpdatedAt).toBe(
      1002,
    );
  });

  it.each([
    999,
    1000,
    undefined,
    'invalid',
  ])('does not replace cached data with response timestamp %s', async (timestamp) => {
    const c = client();
    datafileFetch.mockImplementation(() =>
      Promise.resolve(Response.json({ ...data(), configUpdatedAt: timestamp })),
    );
    const result = await request(20_000, () => c.getDatafile());
    expect(result.configUpdatedAt).toBe(1000);
    expect(result.metrics.cacheStatus).toBe('STALE');
    expect(configCalls()).toHaveLength(1);
  });

  it('does not accept another project in a fetch response', async () => {
    const c = client();
    datafileFetch.mockImplementation(() =>
      Promise.resolve(
        Response.json({ ...data(20_000), projectId: 'prj_other' }),
      ),
    );
    expect((await request(20_000, () => c.getDatafile())).projectId).toBe(
      'prj_123',
    );
    expect(configCalls()).toHaveLength(1);
  });

  it.each([
    'network',
    'http',
    'json',
  ])('serves last-known data on %s failure and throttles retries', async (kind) => {
    const c = client();
    datafileFetch.mockImplementation(() =>
      kind === 'network'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(
            kind === 'http'
              ? new Response('', { status: 503 })
              : new Response('not json'),
          ),
    );
    expect((await request(20_000, () => c.getDatafile())).configUpdatedAt).toBe(
      1000,
    );
    await request(20_000, () => c.getDatafile());
    expect(configCalls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    datafileFetch.mockImplementation(() =>
      Promise.resolve(Response.json(data(20_000))),
    );
    expect((await request(20_000, () => c.getDatafile())).configUpdatedAt).toBe(
      20_000,
    );
    expect(configCalls()).toHaveLength(2);
  });

  it('times out a stalled response body and serves cached data', async () => {
    const c = client();
    datafileFetch.mockImplementation((_url, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener(
            'abort',
            () => controller.error(new Error('aborted')),
            { once: true },
          );
        },
      });
      return Promise.resolve(new Response(body));
    });
    let settled = false;
    const read = request(20_000, () => c.getDatafile()).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(9999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await read;
    expect(result.configUpdatedAt).toBe(1000);
    expect(result.metrics.cacheStatus).toBe('STALE');
    expect(datafileFetch.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(configCalls()).toHaveLength(1);
  });

  it('handles a failed background fetch without an unhandled rejection', async () => {
    const c = client();
    datafileFetch.mockRejectedValue(new Error('offline'));
    expect((await request(1001, () => c.getDatafile())).configUpdatedAt).toBe(
      1000,
    );
    await vi.advanceTimersByTimeAsync(0);
    await expect(
      vi.mocked(waitUntil).mock.calls[0]![0],
    ).resolves.toBeUndefined();
    expect((await request(1001, () => c.getDatafile())).configUpdatedAt).toBe(
      1000,
    );
    expect(configCalls()).toHaveLength(1);
  });

  it('does not require waitUntil support', async () => {
    vi.mocked(waitUntil).mockImplementationOnce(() => {
      throw new Error('no context');
    });
    datafileFetch.mockImplementation(() =>
      Promise.resolve(Response.json(data(1001))),
    );
    const c = client();
    await request(1001, () => c.getDatafile());
    await vi.advanceTimersByTimeAsync(0);
    expect((await request(1001, () => c.getDatafile())).configUpdatedAt).toBe(
      1001,
    );
  });

  it('uses bundled data without opening a stream', async () => {
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      state: 'ok',
      definitions: data(),
    });
    const c = client({ datafile: undefined });
    await request(1000, () => c.initialize());
    expect((await request(1000, () => c.getDatafile())).metrics.source).toBe(
      'embedded',
    );
    expect(configCalls()).toHaveLength(0);
  });

  it('discovers its project by fetching when no local definitions exist', async () => {
    const c = client({ datafile: undefined });
    await headers(
      {
        'x-vercel-edge-config-versions':
          'flags_prj_other=900000;flags_prj_123=1000',
      },
      () => c.initialize(),
    );
    expect(configCalls().map(([url]) => url)).toEqual([
      'https://flags.vercel.com/v1/datafile',
    ]);
    // Discovery cannot safely choose a minimum until it knows this key's project.
    expect(datafileFetch.mock.calls[0]![1]?.headers).not.toHaveProperty(
      'X-Config-Min-Updated-At',
    );
    expect((await request(1000, () => c.getDatafile())).metrics.mode).toBe(
      'pushVersion',
    );
  });

  it('retains streaming on a cold start without a matching flags header', async () => {
    const c = client({ datafile: undefined });
    fetchMock.mockImplementation((url) => {
      if (url.toString().endsWith('/v1/ingest'))
        return Promise.resolve(new Response());
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `${JSON.stringify({ type: 'datafile', data: data() })}\n`,
            ),
          );
        },
      });
      return Promise.resolve(new Response(body));
    });
    await headers({ 'x-vercel-edge-config-versions': 'ecfg_other=1000' }, () =>
      c.initialize(),
    );
    expect(configCalls().map(([url]) => url)).toEqual([
      'https://flags.vercel.com/v1/stream',
    ]);
  });

  it('does not infer a client project from an unrelated header', async () => {
    const c = client({ datafile: { ...data(), projectId: '' } });
    await request(1000, () => c.initialize());
    expect(configCalls().map(([url]) => url)).toEqual([
      'https://flags.vercel.com/v1/stream',
    ]);
  });

  it.each([
    'stream',
    'poll',
  ])('restores %s when the header disappears and stops it when the header returns', async (mode) => {
    const c = client({ stream: mode === 'stream' });
    await request(1000, () => c.initialize());
    expect(configCalls()).toHaveLength(0);
    const legacy = await request(undefined, () => c.evaluate('flagA'));
    expect(legacy.value).toBe(true);
    expect(configCalls().map(([url]) => url)).toEqual([
      `https://flags.vercel.com/v1/${mode === 'stream' ? 'stream' : 'datafile'}`,
    ]);
    const current = await request(1000, () => c.evaluate('flagA'));
    expect(current.metrics?.mode).toBe('pushVersion');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(configCalls()).toHaveLength(1);
  });

  it.each([
    'stream',
    'poll',
  ])('enters pushVersion after initial %s usage', async (mode) => {
    const c = client({ stream: mode === 'stream' });
    await request(undefined, () => c.initialize());
    expect(configCalls()).toHaveLength(1);
    expect((await request(1000, () => c.getDatafile())).metrics.mode).toBe(
      'pushVersion',
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(configCalls()).toHaveLength(1);
  });

  it('cancels an initial legacy poll when a concurrent request restores pushVersion', async () => {
    const c = client({ stream: false });
    await request(1000, () => c.initialize());
    datafileFetch.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          );
        }),
    );
    const legacyRead = request(undefined, () => c.getDatafile());
    await vi.advanceTimersByTimeAsync(0);
    const signal = datafileFetch.mock.calls[0]![1]?.signal;
    expect(signal?.aborted).toBe(false);
    expect((await request(1000, () => c.getDatafile())).metrics.mode).toBe(
      'pushVersion',
    );
    expect(signal?.aborted).toBe(true);
    expect((await legacyRead).configUpdatedAt).toBe(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(configCalls()).toHaveLength(1);
  });

  it('getDatafile returns fresh legacy data when the header disappears', async () => {
    const c = client({ stream: false });
    await request(1000, () => c.initialize());
    datafileFetch.mockImplementation(() =>
      Promise.resolve(Response.json(data(20_000))),
    );
    expect(
      (await request(undefined, () => c.getDatafile())).configUpdatedAt,
    ).toBe(20_000);
    expect(configCalls()).toHaveLength(1);
  });

  it('reports per-read pushVersion refresh behavior without raw headers', async () => {
    const c = client();
    await request(1000, () => c.initialize());
    await request(1001, () => c.evaluate('flagA'));
    await c.shutdown();
    const ingest = fetchMock.mock.calls.filter(([url]) =>
      url.toString().endsWith('/v1/ingest'),
    );
    const events = ingest.flatMap(([, init]) =>
      JSON.parse(init!.body as string),
    );
    const read = events.find((event) => event.type === 'FLAGS_CONFIG_READ');
    expect(read.payload).toMatchObject({
      mode: 'pushVersion',
      cacheStatus: 'STALE',
      cacheAction: 'REFRESHING',
      cacheIsBlocking: false,
    });
    expect(JSON.stringify(events)).not.toContain('flags_prj_123=');
    // Avoid shutting down the same client twice in afterEach.
    clients.splice(clients.indexOf(c), 1);
  });

  it('treats a present invalid primary as authoritative over fallback', async () => {
    const c = client();
    await headers(
      {
        'x-vercel-edge-config-versions': 'flags_prj_123=invalid',
        'edge-config-versions': 'flags_prj_123=1000',
      },
      () => c.initialize(),
    );
    expect(configCalls().map(([url]) => url)).toEqual([
      'https://flags.vercel.com/v1/stream',
    ]);
  });

  it.each([
    'build',
    'offline',
  ])('preserves explicit %s mode despite a newer header', async (mode) => {
    const c = client(
      mode === 'build'
        ? { buildStep: true }
        : { stream: false, polling: false },
    );
    await request(20_000, () => c.initialize());
    expect((await request(20_000, () => c.getDatafile())).configUpdatedAt).toBe(
      1000,
    );
    expect(configCalls()).toHaveLength(0);
  });

  it('cancels scheduled refreshes on shutdown and permits reinitialization', async () => {
    const c = client();
    await request(1001, () => c.initialize());
    await c.shutdown();
    await vi.advanceTimersByTimeAsync(0);
    expect(configCalls()).toHaveLength(0);
    await request(1000, () => c.initialize());
    expect((await request(1000, () => c.getDatafile())).configUpdatedAt).toBe(
      1000,
    );
  });

  it('aborts an in-flight refresh and ignores its late result after shutdown', async () => {
    const c = client();
    const response = deferred<Response>();
    datafileFetch.mockReturnValue(response.promise);
    await request(1001, () => c.initialize());
    await vi.advanceTimersByTimeAsync(0);
    const signal = datafileFetch.mock.calls[0]![1]?.signal;
    await c.shutdown();
    expect(signal?.aborted).toBe(true);
    response.resolve(Response.json(data(1001, false)));
    await vi.advanceTimersByTimeAsync(0);
    await request(1000, () => c.initialize());
    expect((await request(1000, () => c.getDatafile())).configUpdatedAt).toBe(
      1000,
    );
  });

  it('refreshes unknown local timestamps using the header, without streaming', async () => {
    const local: DatafileInput = { ...data(), configUpdatedAt: undefined };
    const c = client({ datafile: local });
    await request(1000, () => c.initialize());
    expect(configCalls().map(([url]) => url)).toEqual([
      'https://flags.vercel.com/v1/datafile',
    ]);
  });
});

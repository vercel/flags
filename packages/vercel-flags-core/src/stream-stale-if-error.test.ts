import { getVercelOidcToken } from '@vercel/oidc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BundledDefinitions,
  type CreateClientOptions,
  createClient,
  type FlagsClient,
} from './index.default';
import { readBundledDefinitions } from './utils/read-bundled-definitions';

vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: vi.fn() }));
vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(),
}));
vi.mock('./lib/report-value', () => ({ internalReportValue: vi.fn() }));

function data(overrides: Partial<BundledDefinitions> = {}): BundledDefinitions {
  return {
    definitions: {
      flagA: { environments: { production: 1 }, variants: [false, true] },
    },
    segments: {},
    environment: 'production',
    projectId: 'prj_123',
    configUpdatedAt: 10,
    revision: 7,
    digest: 'test',
    ...overrides,
  };
}

function primed(overrides: Record<string, unknown> = {}) {
  return {
    type: 'primed',
    revision: 7,
    projectId: 'prj_123',
    environment: 'production',
    ...overrides,
  };
}

// Use real NDJSON decoding, including malformed field values from the server.
function mockStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  const raw = (line: string) => {
    controller.enqueue(new TextEncoder().encode(`${line}\n`));
  };
  return {
    response: new Response(body),
    raw,
    push: (message: unknown) => raw(JSON.stringify(message)),
    fail: (error: Error) => controller.error(error),
    close: () => controller.close(),
  };
}

const streamFetch = vi.fn<typeof fetch>();
const fetchMock = vi.fn<typeof fetch>();
let clients: FlagsClient[];
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

function client(options: CreateClientOptions = {}, oidc = false): FlagsClient {
  const instance = createClient(oidc ? undefined : 'vf_server_fake', {
    buildStep: false,
    stream: { initTimeoutMs: 3_000 },
    // Streaming must remain exclusive even with polling configured.
    polling: { intervalMs: 30_000, initTimeoutMs: 3_000 },
    fetch: fetchMock,
    disableMetrics: true,
    ...options,
  });
  clients.push(instance);
  return instance;
}

async function start(options: CreateClientOptions = {}, oidc = false) {
  const stream = mockStream();
  streamFetch.mockResolvedValueOnce(stream.response);
  const instance = client(options, oidc);
  const evaluation = instance.evaluate('flagA');
  stream.push({ type: 'datafile', data: data() });
  await vi.advanceTimersByTimeAsync(0);
  expect(await evaluation).toMatchObject({
    value: true,
    metrics: { source: 'in-memory', mode: 'streaming' },
  });
  return { instance, stream };
}

function expectRequests(attempts: string[], revision: string | null = '7') {
  expect(streamFetch).toHaveBeenCalledTimes(attempts.length);
  for (const [index, attempt] of attempts.entries()) {
    const [url, init] = streamFetch.mock.calls[index]!;
    expect(url).toBe('https://flags.vercel.com/v1/stream');
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Retry-Attempt')).toBe(attempt);
    expect(headers.get('X-Revision')).toBe(index === 0 ? null : revision);
  }
}

async function expectExpired(instance: FlagsClient, error: Error) {
  await expect(instance.evaluate('flagA')).rejects.toBe(error);
  await expect(instance.getDatafile()).rejects.toBe(error);
}

function expectInitTimeout() {
  expect(warnSpy.mock.calls).toEqual([
    [
      '@vercel/flags-core: Stream initialization timeout, falling back while continuing to connect in the background',
    ],
  ]);
  warnSpy.mockClear();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  clients = [];
  streamFetch
    .mockReset()
    .mockRejectedValue(new Error('unexpected stream fetch'));
  fetchMock.mockReset().mockImplementation((input, init) => {
    if (String(input).endsWith('/v1/stream')) return streamFetch(input, init);
    return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
  });
  vi.mocked(readBundledDefinitions).mockReset().mockResolvedValue({
    state: 'missing-file',
    definitions: null,
  });
  vi.mocked(getVercelOidcToken)
    .mockReset()
    .mockResolvedValue('test-oidc-token');
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  try {
    for (const instance of clients) await instance.shutdown();
    // Reads, reconnects, and shutdown must not introduce polling or fetches.
    expect(fetchMock.mock.calls).toEqual(streamFetch.mock.calls);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

describe('stream stale-if-error through the public API', () => {
  it.each([
    'ping',
    'primed',
  ] as const)('resets stream freshness on %s without changing the fetched snapshot', async (type) => {
    const { instance, stream } = await start({ staleIfError: 0 });
    const initial = await instance.evaluate('flagA');
    const snapshot = await instance.getDatafile();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await instance.evaluate('flagA')).toEqual(initial);
    expect((await instance.getDatafile()).metrics.cacheStatus).toBe('HIT');
    await vi.advanceTimersByTimeAsync(1);
    expect(await instance.evaluate('flagA')).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'STALE' },
    });
    expect((await instance.getDatafile()).metrics.cacheStatus).toBe('STALE');

    stream.push(type === 'ping' ? { type } : primed());
    await vi.advanceTimersByTimeAsync(0);
    expect(await instance.evaluate('flagA')).toEqual(initial);
    const confirmed = await instance.getDatafile();
    expect(confirmed).toEqual(snapshot);
    expect(confirmed.definitions).toBe(snapshot.definitions);
    expect(confirmed.fetchedAt).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await instance.evaluate('flagA')).metrics?.cacheStatus).toBe('HIT');
    await vi.advanceTimersByTimeAsync(1);
    expect((await instance.evaluate('flagA')).metrics?.cacheStatus).toBe(
      'STALE',
    );
    expectRequests(['0']);
  });

  it('does not renew stream freshness on an invalid confirmation', async () => {
    const { instance, stream } = await start();
    const snapshot = await instance.getDatafile();
    await vi.advanceTimersByTimeAsync(30_001);
    for (const override of [
      { revision: 6 },
      { projectId: 'other' },
      { environment: 'preview' },
    ]) {
      stream.push(primed(override));
      await vi.advanceTimersByTimeAsync(0);
      expect((await instance.evaluate('flagA')).metrics?.cacheStatus).toBe(
        'STALE',
      );
      expect(await instance.getDatafile()).toEqual({
        ...snapshot,
        metrics: { ...snapshot.metrics, cacheStatus: 'STALE' },
      });
    }
    expectRequests(['0']);
  });

  it.each([
    undefined,
    Infinity,
  ])('retains unlimited fallback for %s', async (staleIfError) => {
    const { instance, stream } = await start({ staleIfError });
    const snapshot = await instance.getDatafile();
    const failure = new Error('offline');
    streamFetch.mockRejectedValue(failure);
    stream.fail(failure);
    await vi.advanceTimersByTimeAsync(70_000);
    expect(await instance.evaluate('flagA')).toMatchObject({ value: true });
    expect((await instance.getDatafile()).definitions).toBe(
      snapshot.definitions,
    );
    expectRequests(['0', '1', '2', '3', '4', '5', '6', '7']);
  });

  it('keeps the inclusive first-error deadline through retries, HTTP open, pings, and connected events', async () => {
    const { instance, stream } = await start({ staleIfError: 3 });
    const first = new Error('first stream read failed');
    const repeated = new Error('reconnect failed');
    const reconnect = mockStream();
    streamFetch
      .mockRejectedValueOnce(repeated)
      .mockResolvedValueOnce(reconnect.response);
    stream.fail(first);
    await vi.advanceTimersByTimeAsync(0);
    expect(await instance.evaluate('flagA')).toMatchObject({ value: true });
    await vi.advanceTimersByTimeAsync(999);
    expectRequests(['0']);
    await vi.advanceTimersByTimeAsync(1);
    expectRequests(['0', '1']);
    await vi.advanceTimersByTimeAsync(999);
    expectRequests(['0', '1']);
    await vi.advanceTimersByTimeAsync(1);
    expectRequests(['0', '1', '2']);
    reconnect.push({ type: 'ping' });
    // These messages emit connected but neither confirms the cached snapshot.
    reconnect.push(primed({ revision: 6 }));
    reconnect.push({ type: 'datafile', data: data({ configUpdatedAt: 9 }) });
    reconnect.push({ type: 'ping' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await instance.evaluate('flagA')).toMatchObject({
      value: true,
      metrics: {
        mode: 'streaming',
        connectionState: 'connected',
        cacheStatus: 'HIT',
      },
    });
    expect((await instance.getDatafile()).configUpdatedAt).toBe(10);
    await vi.advanceTimersByTimeAsync(1);
    await expectExpired(instance, first);
    reconnect.push({ type: 'ping' });
    await vi.advanceTimersByTimeAsync(0);
    await expectExpired(instance, first);
    const fallback = {
      value: false,
      variantId: null,
      reason: 'error',
      errorMessage: first.message,
    };
    expect(await instance.evaluate('flagA', false)).toEqual(fallback);
    expect(
      await instance.bulkEvaluate([
        { key: 'flagA', defaultValue: false },
        { key: 'missing' },
      ]),
    ).toEqual({
      flagA: fallback,
      missing: { ...fallback, value: undefined },
    });
    expectRequests(['0', '1', '2']);
  });

  it.each([
    10,
    '10',
    11,
  ])('recovers on stream configUpdatedAt %s, replacing only accepted data', async (configUpdatedAt) => {
    const { instance, stream } = await start({ staleIfError: 0 });
    const snapshot = await instance.getDatafile();
    const reconnect = mockStream();
    streamFetch.mockResolvedValueOnce(reconnect.response);
    const failure = new Error('outage');
    stream.fail(failure);
    await vi.advanceTimersByTimeAsync(0);
    await expectExpired(instance, failure);
    await vi.advanceTimersByTimeAsync(1_000);
    await expectExpired(instance, failure); // HTTP 200 alone is not recovery.
    reconnect.push({
      type: 'datafile',
      data: data({
        configUpdatedAt: configUpdatedAt as number,
        revision: 8,
        definitions: {
          flagA: { environments: { production: 0 }, variants: [false, true] },
        },
      }),
    });
    await vi.advanceTimersByTimeAsync(0);
    const replaced = configUpdatedAt === 11;
    expect((await instance.evaluate('flagA')).value).toBe(!replaced);
    const recovered = await instance.getDatafile();
    expect(recovered.revision).toBe(replaced ? 8 : 7);
    if (replaced) {
      expect(recovered.definitions).not.toBe(snapshot.definitions);
    } else {
      expect(recovered.definitions).toBe(snapshot.definitions);
      expect(recovered.segments).toBe(snapshot.segments);
    }
    const second = new Error('second outage');
    reconnect.fail(second);
    await vi.advanceTimersByTimeAsync(0);
    await expectExpired(instance, second);
    expectRequests(['0', '1']);
  });

  it('uses a retained revision after expiry, confirms primed without replacement, and starts a fresh second allowance', async () => {
    const { instance, stream } = await start({ staleIfError: 0.1 });
    const snapshot = await instance.getDatafile();
    const reconnect = mockStream();
    streamFetch.mockResolvedValueOnce(reconnect.response);
    const first = new Error('first outage');
    stream.fail(first);
    await vi.advanceTimersByTimeAsync(101);
    await expectExpired(instance, first);
    expectRequests(['0']);
    await vi.advanceTimersByTimeAsync(899);
    expectRequests(['0', '1']);
    await expectExpired(instance, first);
    reconnect.push(primed());
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    const recovered = await instance.getDatafile();
    expect(recovered.definitions).toBe(snapshot.definitions);
    expect(recovered.segments).toBe(snapshot.segments);
    expect(recovered.metrics).toMatchObject({
      source: 'in-memory',
      mode: 'streaming',
    });
    const second = new Error('second outage');
    reconnect.fail(second);
    await vi.advanceTimersByTimeAsync(100);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expect((await instance.getDatafile()).definitions).toBe(
      snapshot.definitions,
    );
    await vi.advanceTimersByTimeAsync(1);
    await expectExpired(instance, second);
    expectRequests(['0', '1']);
  });

  it('rejects old, unequal, malformed, missing, nonfinite, or wrong-identity primed confirmations', async () => {
    const { instance, stream } = await start({ staleIfError: 0 });
    const snapshot = await instance.getDatafile();
    const reconnect = mockStream();
    streamFetch.mockResolvedValueOnce(reconnect.response);
    const failure = new Error('outage');
    stream.fail(failure);
    await vi.advanceTimersByTimeAsync(1_000);
    for (const override of [
      { revision: 6 },
      { revision: 8 },
      { revision: '7' },
      { revision: 'invalid' },
      { revision: null },
      { revision: undefined },
      { projectId: 'other' },
      { projectId: undefined },
      { environment: 'preview' },
      { environment: undefined },
    ]) {
      reconnect.push(primed(override));
      await vi.advanceTimersByTimeAsync(0);
      await expectExpired(instance, failure);
    }
    // JSON supports overflowing numeric literals; stringify(Infinity) is null.
    for (const revision of ['1e400', '-1e400']) {
      reconnect.raw(
        `{"type":"primed","revision":${revision},"projectId":"prj_123","environment":"production"}`,
      );
      await vi.advanceTimersByTimeAsync(0);
      await expectExpired(instance, failure);
    }
    reconnect.push(primed());
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expect((await instance.getDatafile()).definitions).toBe(
      snapshot.definitions,
    );
    expectRequests(['0', '1']);
  });

  it.each([
    '7',
    undefined,
    Infinity,
  ])('cannot confirm a retained nonnumeric or nonfinite revision %s', async (revision) => {
    const supplied = data({ revision: revision as number });
    const stream = mockStream();
    const reconnect = mockStream();
    streamFetch
      .mockResolvedValueOnce(stream.response)
      .mockResolvedValueOnce(reconnect.response);
    const instance = client({ datafile: supplied, staleIfError: 0 });
    const initial = instance.evaluate('flagA');
    stream.push(primed());
    await vi.advanceTimersByTimeAsync(0);
    expect((await initial).value).toBe(true);
    const failure = new Error('outage');
    stream.fail(failure);
    await vi.advanceTimersByTimeAsync(1_000);
    if (revision === Infinity) {
      reconnect.raw(
        '{"type":"primed","revision":1e400,"projectId":"prj_123","environment":"production"}',
      );
    } else {
      reconnect.push(primed({ revision }));
    }
    await vi.advanceTimersByTimeAsync(0);
    await expectExpired(instance, failure);
    reconnect.push({ type: 'datafile', data: data({ configUpdatedAt: 11 }) });
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expect((await instance.getDatafile()).definitions).not.toBe(
      supplied.definitions,
    );
    expect(streamFetch).toHaveBeenCalledTimes(2);
  });

  it('does not confirm rejected same-version data with mismatched identity or older versions', async () => {
    const { instance, stream } = await start({ staleIfError: 0 });
    const snapshot = await instance.getDatafile();
    const reconnect = mockStream();
    streamFetch.mockResolvedValueOnce(reconnect.response);
    const failure = new Error('outage');
    stream.fail(failure);
    await vi.advanceTimersByTimeAsync(1_000);
    for (const override of [
      { configUpdatedAt: 9 },
      { projectId: 'other' },
      { environment: 'preview' },
    ]) {
      reconnect.push({ type: 'datafile', data: data(override) });
      await vi.advanceTimersByTimeAsync(0);
      await expectExpired(instance, failure);
    }
    reconnect.push({ type: 'datafile', data: data() });
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expect((await instance.getDatafile()).definitions).toBe(
      snapshot.definitions,
    );
    expectRequests(['0', '1']);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('does not renew an exhausted allowance when initialization falls back to a %s seed', async (seed) => {
    const supplied = data();
    if (seed === 'bundled') {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: supplied,
      });
    }
    const failure = new Error('initial connection failed');
    const reconnect = mockStream();
    streamFetch
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(reconnect.response);
    const instance = client({
      staleIfError: 0,
      ...(seed === 'provided' ? { datafile: supplied } : {}),
    });
    const evaluation = instance.evaluate('flagA', false);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await evaluation).toEqual({
      value: false,
      variantId: null,
      reason: 'error',
      errorMessage: failure.message,
    });
    expectInitTimeout();
    await expectExpired(instance, failure);
    reconnect.push(primed());
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    const recovered = await instance.getDatafile();
    expect(recovered.definitions).toBe(supplied.definitions);
    expect(recovered.metrics.source).toBe(
      seed === 'provided' ? 'in-memory' : 'embedded',
    );
    expect(streamFetch).toHaveBeenCalledTimes(2);
    for (const [, init] of streamFetch.mock.calls) {
      expect(new Headers(init?.headers).get('X-Revision')).toBe('7');
    }
  });

  it('does not start SIE on initialization timeout or ping, but does on a late failure', async () => {
    const stream = mockStream();
    streamFetch.mockResolvedValueOnce(stream.response);
    const supplied = data();
    const instance = client({ datafile: supplied, staleIfError: 0 });
    const initialized = vi.fn();
    const initialization = Promise.resolve(instance.initialize()).then(
      initialized,
    );
    await vi.advanceTimersByTimeAsync(2_999);
    stream.push({ type: 'ping' });
    await vi.advanceTimersByTimeAsync(0);
    expect(initialized).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await initialization;
    expect(initialized).toHaveBeenCalledOnce();
    expectInitTimeout();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expect((await instance.getDatafile()).definitions).toBe(
      supplied.definitions,
    );
    const reconnect = mockStream();
    streamFetch.mockResolvedValueOnce(reconnect.response);
    const failure = new Error('late stream failure');
    stream.fail(failure);
    await vi.advanceTimersByTimeAsync(0);
    await expectExpired(instance, failure);
    // A long-lived connection has already satisfied the minimum retry gap.
    expect(streamFetch).toHaveBeenCalledTimes(2);
    expect(
      new Headers(streamFetch.mock.calls[1]![1]?.headers).get('X-Revision'),
    ).toBe('7');
  });

  it('records a clean disconnect immediately with zero and does not renew on repeated closes', async () => {
    const { instance, stream } = await start({ staleIfError: 0 });
    const reconnect = mockStream();
    streamFetch.mockResolvedValueOnce(reconnect.response);
    stream.close();
    await vi.advanceTimersByTimeAsync(0);
    const failure = await instance
      .evaluate('flagA')
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ message: 'stream: disconnected' });
    await expectExpired(instance, failure as Error);
    await vi.advanceTimersByTimeAsync(1_000);
    reconnect.close();
    await vi.advanceTimersByTimeAsync(0);
    await expectExpired(instance, failure as Error);
    expectRequests(['0', '1']);
  });

  it('starts SIE only at ping timeout and keeps the original failure through another ping timeout', async () => {
    const { instance } = await start({ staleIfError: 0.1 });
    const reconnect = mockStream();
    const third = mockStream();
    streamFetch
      .mockResolvedValueOnce(reconnect.response)
      .mockResolvedValueOnce(third.response);
    await vi.advanceTimersByTimeAsync(89_999);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expectRequests(['0']);
    await vi.advanceTimersByTimeAsync(2);
    expectRequests(['0', '1']);
    reconnect.push({ type: 'ping' });
    await vi.advanceTimersByTimeAsync(99);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    const failure = await instance
      .evaluate('flagA')
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ message: 'stream: disconnected' });
    await expectExpired(instance, failure as Error);
    await vi.advanceTimersByTimeAsync(89_901);
    await expectExpired(instance, failure as Error);
    expectRequests(['0', '1', '1']);
  });

  it('stops silently on terminal 401 without replacing the first error or renewing its deadline', async () => {
    const { instance, stream } = await start({ staleIfError: 1 });
    const first = new Error('stream failed before unauthorized reconnect');
    streamFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    stream.fail(first);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await expectExpired(instance, first);
    await vi.advanceTimersByTimeAsync(60_000);
    expectRequests(['0', '1']);
  });

  it('fast-fails initial 401 against a zero allowance without retries or timeout logging', async () => {
    streamFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const instance = client({ datafile: data(), staleIfError: 0 });
    const failure = await instance
      .evaluate('flagA')
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ message: 'stream: unauthorized (401)' });
    await expectExpired(instance, failure as Error);
    expect(Date.now()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(streamFetch).toHaveBeenCalledTimes(1);
  });

  it('forwards initial OIDC resolution failure without fetching or waiting for initialization timeout', async () => {
    vi.mocked(getVercelOidcToken).mockRejectedValue(
      new Error('OIDC unavailable'),
    );
    const instance = client({ datafile: data(), staleIfError: 0 }, true);
    const failure = await instance
      .evaluate('flagA')
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({
      message: 'stream: token resolution failed',
      cause: expect.objectContaining({
        message: expect.stringContaining(
          '@vercel/flags-core: Failed to get OIDC token.',
        ),
      }),
    });
    await expectExpired(instance, failure as Error);
    expect(Date.now()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getVercelOidcToken).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs only the final error when retries are exhausted', async () => {
    const { instance, stream } = await start();
    const failure = new Error('persistent connection failure');
    streamFetch.mockRejectedValue(failure);
    stream.fail(failure);
    await vi.advanceTimersByTimeAsync(700_000);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expectRequests(Array.from({ length: 16 }, (_, index) => String(index)));
    expect(errorSpy.mock.calls).toEqual([
      ['@vercel/flags-core: Max retry count exceeded', failure],
    ]);
    errorSpy.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(streamFetch).toHaveBeenCalledTimes(16);
  });

  it('cancels a pending retry on shutdown without new warnings or errors', async () => {
    const { instance, stream } = await start({ staleIfError: 0 });
    stream.fail(new Error('disconnected before shutdown'));
    await vi.advanceTimersByTimeAsync(0);
    await instance.shutdown();
    clients = clients.filter((entry) => entry !== instance);
    await vi.advanceTimersByTimeAsync(60_000);
    expectRequests(['0']);
  });
});

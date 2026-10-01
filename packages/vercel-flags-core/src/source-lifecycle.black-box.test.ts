import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  type BundledDefinitions,
  createClient,
  type FlagsClient,
} from './index.default';
import { setRequestContext } from './test-utils';
import { readBundledDefinitions } from './utils/read-bundled-definitions';

vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(),
}));

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

const now = 1_700_000_000_000;
const clients = new Set<FlagsClient>();
const dataFetch = vi.fn<typeof fetch>();
const streamFetch = vi.fn<typeof fetch>();
let cleanContext = () => {};

function data(version = 1, enabled = true): BundledDefinitions {
  return {
    definitions: {
      feature: {
        environments: { production: enabled ? 1 : 0 },
        variants: [false, true],
      },
    },
    segments: {},
    projectId: 'prj_review',
    environment: 'production',
    digest: String(version),
    configUpdatedAt: version,
    revision: version,
  };
}

function context(version?: number) {
  cleanContext();
  cleanContext = setRequestContext(
    version === undefined
      ? {}
      : {
          'x-vercel-flags-config-versions': `flags_prj_review=${version}`,
        },
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((value) => {
    resolve = value;
  });
  return { promise, resolve };
}

function stream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  return {
    response: new Response(body),
    push(message: unknown) {
      controller.enqueue(
        new TextEncoder().encode(`${JSON.stringify(message)}\n`),
      );
    },
    close() {
      controller.close();
    },
    fail(error: Error) {
      controller.error(error);
    },
  };
}

function client(options: Parameters<typeof createClient>[1] = {}) {
  const instance = createClient('vf_server_review', {
    buildStep: false,
    vercel: false,
    disableMetrics: true,
    datafile: data(),
    fetch: (input, init) => {
      if (String(input).endsWith('/v1/datafile')) {
        return dataFetch(input, init);
      }
      if (String(input).endsWith('/v1/stream')) {
        return streamFetch(input, init);
      }
      return Promise.resolve(new Response());
    },
    ...options,
  });
  clients.add(instance);
  return instance;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.stubEnv('VERCEL', '0');
  vi.mocked(readBundledDefinitions).mockResolvedValue({
    definitions: null,
    state: 'missing-file',
  });
  dataFetch.mockReset().mockImplementation(async () => Response.json(data()));
  streamFetch.mockReset();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  context();
});

afterEach(async () => {
  try {
    for (const instance of clients) {
      await instance.shutdown();
    }
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  } finally {
    clients.clear();
    cleanContext();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});

it('refreshes provided data before polling initialize resolves', async () => {
  dataFetch.mockResolvedValueOnce(Response.json(data(2, false)));
  const instance = client({
    stream: false,
    datafile: { ...data(), fetchedAt: now },
  });
  await instance.initialize();
  const snapshot = await instance.getDatafile();
  expect({
    requests: dataFetch.mock.calls.length,
    version: snapshot.configUpdatedAt,
  }).toEqual({ requests: 1, version: 2 });
  expect(dataFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
});

it('serves cached fallback at the configured polling startup timeout', async () => {
  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);
  const instance = client({
    stream: false,
    polling: { intervalMs: 30_000, initTimeoutMs: 50 },
  });
  const settled = vi.fn();
  const reading = instance.evaluate('feature').then((result) => {
    settled();
    return result;
  });
  await vi.advanceTimersByTimeAsync(50);
  expect(warnSpy).toHaveBeenCalledExactlyOnceWith(
    '@vercel/flags-core: Polling initialization timeout, falling back while continuing to poll in the background',
  );
  warnSpy.mockClear();
  const completedAtTimeout = settled.mock.calls.length;
  pending.resolve(Response.json(data(2)));
  expect(await reading).toMatchObject({
    value: true,
    metrics: { mode: 'polling', cacheStatus: 'STALE' },
  });
  expect(completedAtTimeout).toBe(1);
});

it('tolerates a delayed stream ping without starting an early HTTP refresh', async () => {
  const live = stream();
  streamFetch.mockResolvedValueOnce(live.response);
  const instance = client({ polling: false });
  const initial = instance.evaluate('feature');
  live.push({ type: 'datafile', data: data(2) });
  await initial;
  await vi.advanceTimersByTimeAsync(40_001);
  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);
  const settled = vi.fn();
  const reading = instance.evaluate('feature').then((result) => {
    settled();
    return result;
  });
  await vi.advanceTimersByTimeAsync(0);
  const observed = {
    requests: dataFetch.mock.calls.length,
    completed: settled.mock.calls.length,
  };
  pending.resolve(Response.json(data(2)));
  expect(await reading).toMatchObject({
    value: true,
    metrics: { mode: 'streaming', cacheStatus: 'HIT' },
  });
  expect(observed).toEqual({ requests: 0, completed: 1 });
});

it.each([
  'reader cancellation',
  'transport abort error',
] as const)('reconnects an overdue stream internally after suspension: %s', async (abortPath) => {
  const first = stream();
  const second = stream();
  streamFetch
    .mockImplementationOnce(async (_input, init) => {
      if (abortPath === 'transport abort error') {
        init?.signal?.addEventListener('abort', () => {
          first.fail(new Error('transport aborted'));
        });
      }
      return first.response;
    })
    .mockResolvedValueOnce(second.response);
  const instance = client({ staleIfError: 0 });
  const initial = instance.evaluate('feature');
  first.push({ type: 'datafile', data: data(2) });
  await initial;
  const snapshot = await instance.getDatafile();

  // Wall-clock age advances without any source messages while suspended.
  vi.setSystemTime(now + 600_000);
  await vi.advanceTimersByTimeAsync(90_001);
  expect(streamFetch).toHaveBeenCalledTimes(2);
  expect(streamFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(streamFetch.mock.calls[1]?.[1]?.signal?.aborted).toBe(false);
  expect(
    new Headers(streamFetch.mock.calls[1]?.[1]?.headers).get('X-Revision'),
  ).toBe('2');
  expect(await instance.getDatafile()).toMatchObject({
    fetchedAt: snapshot.fetchedAt,
    metrics: { mode: 'streaming', cacheStatus: 'STALE' },
  });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(dataFetch).not.toHaveBeenCalled();

  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);
  const settled = vi.fn();
  const reading = instance.evaluate('feature').then((result) => {
    settled();
    return result;
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(dataFetch).toHaveBeenCalledTimes(1);
  expect(settled).not.toHaveBeenCalled();
  second.push({
    type: 'primed',
    revision: 2,
    projectId: 'prj_review',
    environment: 'production',
  });
  expect(await reading).toMatchObject({
    value: true,
    metrics: { mode: 'streaming', cacheStatus: 'HIT' },
  });
  expect(dataFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect((await instance.getDatafile()).fetchedAt).toBe(snapshot.fetchedAt);
  pending.resolve(Response.json(data(1, false)));
  await vi.advanceTimersByTimeAsync(0);
  expect((await instance.getDatafile()).configUpdatedAt).toBe(2);
});

it('keeps a watchdog on silent replacement streams without starting polling', async () => {
  const first = stream();
  streamFetch
    .mockResolvedValueOnce(first.response)
    .mockImplementation(async () => stream().response);
  const instance = client({ staleIfError: 0 });
  const initial = instance.evaluate('feature');
  first.push({ type: 'datafile', data: data(2) });
  await initial;
  await vi.advanceTimersByTimeAsync(180_002);
  // The second connection times out too; its next retry has one second of backoff.
  await vi.advanceTimersByTimeAsync(1_000);
  expect(streamFetch).toHaveBeenCalledTimes(3);
  expect(streamFetch.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
  expect(dataFetch).not.toHaveBeenCalled();
  expect(await instance.getDatafile()).toMatchObject({
    fetchedAt: now,
    metrics: { mode: 'streaming', cacheStatus: 'STALE' },
  });
});

it.each([
  503, 401,
])('falls back to polling when the replacement stream returns %i', async (status) => {
  const first = stream();
  streamFetch
    .mockResolvedValueOnce(first.response)
    .mockResolvedValueOnce(new Response(null, { status }))
    .mockImplementation(async () => stream().response);
  const instance = client();
  const initial = instance.evaluate('feature');
  first.push({ type: 'datafile', data: data(2) });
  await initial;
  await vi.advanceTimersByTimeAsync(90_001);
  expect((await instance.getDatafile()).metrics.mode).toBe('polling');
  dataFetch.mockResolvedValueOnce(Response.json(data(3, false)));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(dataFetch).toHaveBeenCalledTimes(1);
  expect(await instance.evaluate('feature')).toMatchObject({
    value: false,
    metrics: { mode: 'polling', cacheStatus: 'HIT' },
  });
});

it('falls back to polling if silent reconnects exhaust the stream retry budget', async () => {
  const first = stream();
  streamFetch
    .mockResolvedValueOnce(first.response)
    .mockImplementation(async () => stream().response);
  const instance = client();
  const initial = instance.evaluate('feature');
  first.push({ type: 'datafile', data: data(2) });
  await initial;
  await vi.advanceTimersByTimeAsync(3_000_000);
  expect(streamFetch).toHaveBeenCalledTimes(16);
  expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
    '@vercel/flags-core: Max retry count exceeded',
    expect.objectContaining({ message: 'stream: ping timeout' }),
  );
  errorSpy.mockClear();
  expect((await instance.getDatafile()).metrics.mode).toBe('polling');
  const previousPolls = dataFetch.mock.calls.length;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(dataFetch).toHaveBeenCalledTimes(previousPolls + 1);
  expect(streamFetch).toHaveBeenCalledTimes(16);
});

it('does not reconnect or start polling when shutdown races a ping timeout', async () => {
  const first = stream();
  streamFetch.mockResolvedValueOnce(first.response);
  const instance = client();
  const initial = instance.evaluate('feature');
  first.push({ type: 'datafile', data: data(2) });
  await initial;
  // Trigger cancellation, then shut down before its asynchronous retry runs.
  vi.advanceTimersByTime(90_000);
  await instance.shutdown();
  clients.delete(instance);
  await vi.advanceTimersByTimeAsync(90_000);
  expect(streamFetch).toHaveBeenCalledTimes(1);
  expect(dataFetch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('resumes polling after suspension and shares the pending poll with expired reads', async () => {
  const instance = client({ stream: false, staleIfError: 0 });
  await instance.initialize();
  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);
  vi.setSystemTime(now + 600_000);
  await vi.advanceTimersByTimeAsync(30_000);
  const settled = vi.fn();
  const reading = instance.evaluate('feature').then((result) => {
    settled();
    return result;
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(dataFetch).toHaveBeenCalledTimes(2);
  expect(settled).not.toHaveBeenCalled();
  pending.resolve(Response.json(data(2, false)));
  expect(await reading).toMatchObject({
    value: false,
    metrics: { mode: 'polling', cacheStatus: 'MISS' },
  });
  expect(dataFetch).toHaveBeenCalledTimes(2);
  expect(streamFetch).not.toHaveBeenCalled();
});

it('continues scheduled polling after an in-flight fetch times out across suspension', async () => {
  const instance = client({ stream: false, staleIfError: 0 });
  await instance.initialize();
  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);
  await vi.advanceTimersByTimeAsync(30_000);
  vi.setSystemTime(now + 600_000);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(dataFetch.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
  await expect(instance.getDatafile()).rejects.toThrow(
    '@vercel/flags-core: Datafile fetch deadline exceeded',
  );
  dataFetch.mockResolvedValueOnce(Response.json(data(2, false)));
  await vi.advanceTimersByTimeAsync(20_000);
  expect(dataFetch).toHaveBeenCalledTimes(3);
  pending.resolve(new Response(null, { status: 401 }));
  await vi.advanceTimersByTimeAsync(0);
  expect(await instance.evaluate('feature')).toMatchObject({
    value: false,
    metrics: { mode: 'polling', cacheStatus: 'HIT' },
  });
  expect((await instance.getDatafile()).configUpdatedAt).toBe(2);
  expect(streamFetch).not.toHaveBeenCalled();
});

it('does not invalidate a healthy stream when a retired header fetch fails late', async () => {
  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);
  const instance = client({ vercel: true, staleIfError: 0 });
  context(2);
  const original = instance.evaluate('feature', false);
  await vi.advanceTimersByTimeAsync(0);
  const live = stream();
  streamFetch.mockResolvedValueOnce(live.response);
  context();
  const switching = instance.evaluate('feature');
  await vi.advanceTimersByTimeAsync(0);
  live.push({ type: 'datafile', data: data(3) });
  expect((await switching).value).toBe(true);
  expect(await original).toMatchObject({
    value: true,
    metrics: { mode: 'streaming', cacheStatus: 'HIT' },
  });
  expect(dataFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  pending.resolve(
    new Response(null, { status: 401, statusText: 'Unauthorized' }),
  );
  await vi.advanceTimersByTimeAsync(0);
  const result = await instance.evaluate('feature', false);
  expect(result).toMatchObject({ value: true, metrics: { mode: 'streaming' } });
});

it('cancels pending polling work when a stream reconnects', async () => {
  const first = stream();
  const second = stream();
  streamFetch
    .mockResolvedValueOnce(first.response)
    .mockResolvedValueOnce(second.response);
  const instance = client({ staleIfError: 0 });
  const initial = instance.evaluate('feature');
  first.push({ type: 'datafile', data: data(2) });
  await initial;
  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);
  first.close();
  await vi.advanceTimersByTimeAsync(30_000);
  const signal = dataFetch.mock.calls[0]?.[1]?.signal;
  expect(dataFetch).toHaveBeenCalledTimes(1);
  second.push({
    type: 'primed',
    revision: 2,
    projectId: 'prj_review',
    environment: 'production',
  });
  await vi.advanceTimersByTimeAsync(0);
  const abortedOnReconnect = signal?.aborted;
  pending.resolve(
    new Response(null, { status: 401, statusText: 'Unauthorized' }),
  );
  await vi.advanceTimersByTimeAsync(0);
  const result = await instance.evaluate('feature', false);
  expect({ abortedOnReconnect, value: result.value }).toEqual({
    abortedOnReconnect: true,
    value: true,
  });
});

it.each([
  ['equal datafile', { type: 'datafile', data: data(2) }, true],
  [
    'matching revision',
    {
      type: 'primed',
      revision: 2,
      projectId: 'prj_review',
      environment: 'production',
    },
    true,
  ],
  ['ping', { type: 'ping' }, true],
  ['older datafile', { type: 'datafile', data: data(1) }, false],
  [
    'mismatched revision',
    {
      type: 'primed',
      revision: 1,
      projectId: 'prj_review',
      environment: 'production',
    },
    false,
  ],
] as const)('only supersedes a pending refresh with valid stream evidence: %s', async (_kind, message, confirms) => {
  const live = stream();
  streamFetch.mockResolvedValueOnce(live.response);
  const instance = client({ polling: false, staleIfError: 0 });
  const initial = instance.evaluate('feature');
  live.push({ type: 'datafile', data: data(2) });
  await initial;

  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);
  vi.setSystemTime(now + 90_001);
  const settled = vi.fn();
  const reading = instance.evaluate('feature').then((result) => {
    settled();
    return result;
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).not.toHaveBeenCalled();
  expect(dataFetch).toHaveBeenCalledTimes(1);
  const signal = dataFetch.mock.calls[0]?.[1]?.signal;

  live.push(message);
  await vi.advanceTimersByTimeAsync(0);
  expect(signal?.aborted).toBe(confirms);
  if (confirms) {
    expect(settled).toHaveBeenCalledTimes(1);
    expect(await reading).toMatchObject({
      value: true,
      metrics: { cacheStatus: 'HIT' },
    });
    pending.resolve(new Response(null, { status: 401 }));
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.evaluate('feature')).value).toBe(true);
  } else {
    expect(settled).not.toHaveBeenCalled();
    pending.resolve(Response.json(data(3, false)));
    expect(await reading).toMatchObject({
      value: false,
      metrics: { cacheStatus: 'MISS' },
    });
    expect(signal?.aborted).toBe(false);
  }
  expect(dataFetch).toHaveBeenCalledTimes(1);
});

it('does not restart polling after shutdown during missing-header stream startup', async () => {
  const live = stream();
  streamFetch.mockResolvedValueOnce(live.response);
  const instance = client({ vercel: true });
  await instance.initialize();
  context();
  const reading = expect(instance.evaluate('feature')).rejects.toThrow(
    '@vercel/flags-core: Client is shut down',
  );
  await vi.advanceTimersByTimeAsync(0);
  await instance.shutdown();
  clients.delete(instance);
  await vi.advanceTimersByTimeAsync(30_001);
  await reading;
  expect({
    requests: dataFetch.mock.calls.length,
    timers: vi.getTimerCount(),
  }).toEqual({ requests: 0, timers: 0 });
});

it.each([
  ['streaming', 30_000, 60_000, 90_000],
  ['polling', 30_000, 40_000, 70_000],
  ['polling', 45_000, 55_000, 100_000],
] as const)('uses background then blocking refresh for %s at interval %i', async (mode, intervalMs, staleAt, expiresAt) => {
  const live = stream();
  streamFetch.mockResolvedValueOnce(live.response);
  const instance = client({
    stream: mode === 'streaming',
    polling: { intervalMs, initTimeoutMs: 3_000 },
    // This controls headers; scheduled sources use their own timing windows.
    staleWhileRevalidate: 0,
  });
  const initial = instance.evaluate('feature');
  if (mode === 'streaming') {
    live.push({ type: 'datafile', data: data() });
  }
  await initial;
  const initialRequests = mode === 'polling' ? 1 : 0;
  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);

  // Move wall-clock age independently of timers to model a suspended runtime.
  vi.setSystemTime(now + staleAt);
  expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe('HIT');
  expect(dataFetch).toHaveBeenCalledTimes(initialRequests);
  vi.setSystemTime(now + staleAt + 1);
  expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
    'STALE',
  );
  expect(dataFetch).toHaveBeenCalledTimes(initialRequests + 1);

  vi.setSystemTime(now + expiresAt);
  expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
    'STALE',
  );
  vi.setSystemTime(now + expiresAt + 1);
  const settled = vi.fn();
  const reading = instance.evaluate('feature').then((result) => {
    settled();
    return result;
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).not.toHaveBeenCalled();
  expect(dataFetch).toHaveBeenCalledTimes(initialRequests + 1);
  pending.resolve(Response.json(data(2, false)));
  expect(await reading).toMatchObject({
    value: false,
    metrics: { cacheStatus: 'MISS' },
  });
  expect(dataFetch).toHaveBeenCalledTimes(initialRequests + 1);
});

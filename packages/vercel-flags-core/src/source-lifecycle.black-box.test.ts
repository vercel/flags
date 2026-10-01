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

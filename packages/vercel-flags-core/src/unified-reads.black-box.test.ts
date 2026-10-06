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

const now = 1_700_000_000_000;
const clients = new Set<FlagsClient>();
const dataFetch = vi.fn<typeof fetch>();
const streamFetch = vi.fn<typeof fetch>();
let cleanupContext = () => {};
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function data(projectId = 'prj_a', revision = 1): BundledDefinitions {
  return {
    projectId,
    environment: 'production',
    revision,
    digest: String(revision),
    configUpdatedAt: revision,
    fetchedAt: now,
    segments: {},
    definitions: {
      feature: {
        environments: { production: revision % 2 },
        variants: [false, true],
      },
    },
  };
}

function context(value?: string) {
  cleanupContext();
  cleanupContext = setRequestContext(
    value === undefined ? {} : { 'x-vercel-flags-config-versions': value },
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
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

function client(
  projectId = 'prj_a',
  options: Parameters<typeof createClient>[1] = {},
) {
  const instance = createClient(`vf_server_${projectId}`, {
    vercel: true,
    buildStep: false,
    disableMetrics: true,
    datafile: data(projectId),
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
  vi.mocked(readBundledDefinitions).mockResolvedValue({
    definitions: null,
    state: 'missing-file',
  });
  dataFetch.mockReset();
  streamFetch.mockReset();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  context('flags_prj_a=1');
});

afterEach(async () => {
  try {
    await Promise.all([...clients].map((instance) => instance.shutdown()));
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  } finally {
    clients.clear();
    cleanupContext();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
});

it.each([
  'streaming',
  'polling',
] as const)('selects %s independently for the client missing from a shared request header', async (mode) => {
  const connection = stream();
  streamFetch.mockResolvedValueOnce(connection.response);
  dataFetch.mockResolvedValueOnce(Response.json(data('prj_b', 2)));
  const first = client();
  const second = client('prj_b', { stream: mode === 'streaming' });
  const reading = second.evaluate('feature');
  connection.push({ type: 'datafile', data: data('prj_b', 2) });
  expect(await first.evaluate('feature')).toMatchObject({
    value: true,
    metrics: { mode: 'vercel', cacheStatus: 'HIT' },
  });
  expect(await reading).toMatchObject({
    value: false,
    metrics: { mode, cacheStatus: 'HIT' },
  });
  expect(await second.getDatafile()).toMatchObject({
    projectId: 'prj_b',
    revision: 2,
    metrics: { mode, cacheStatus: 'HIT' },
  });
  expect(streamFetch).toHaveBeenCalledTimes(mode === 'streaming' ? 1 : 0);
  expect(dataFetch).toHaveBeenCalledTimes(mode === 'polling' ? 1 : 0);
  const calls =
    mode === 'streaming' ? streamFetch.mock.calls : dataFetch.mock.calls;
  expect(new Headers(calls[0]?.[1]?.headers).get('Authorization')).toBe(
    'Bearer vf_server_prj_b',
  );
  context('flags_prj_a=1;flags_prj_b=2');
  expect((await first.getDatafile()).metrics.mode).toBe('vercel');
  expect((await second.evaluate('feature')).metrics?.mode).toBe(mode);
});

it.each([
  'flags_prj_a=1',
  'flags_prj_b=1',
  'flags_prj_a=invalid',
  '',
  undefined,
])('serves a shared cold fetch and selects the source on the next read for header %s', async (header) => {
  context(header);
  dataFetch.mockResolvedValueOnce(Response.json(data()));
  const connection = stream();
  streamFetch.mockResolvedValueOnce(connection.response);
  const instance = client('prj_a', { datafile: undefined });
  const [file, evaluation] = await Promise.all([
    instance.getDatafile(),
    instance.evaluate('feature'),
  ]);
  expect(file).toMatchObject({
    projectId: 'prj_a',
    metrics: { mode: 'vercel', cacheStatus: 'MISS' },
  });
  expect(evaluation).toMatchObject({
    value: true,
    metrics: { mode: 'vercel', cacheStatus: 'MISS' },
  });
  expect(dataFetch).toHaveBeenCalledTimes(1);
  expect(streamFetch).not.toHaveBeenCalled();

  // Only evaluations switch sources; snapshots follow the selected source.
  const reading = instance.evaluate('feature');
  connection.push({ type: 'datafile', data: data() });
  const mode = header === 'flags_prj_a=1' ? 'vercel' : 'streaming';
  expect(await reading).toMatchObject({
    value: true,
    metrics: { mode, cacheStatus: 'HIT' },
  });
  expect(await instance.getDatafile()).toMatchObject({
    projectId: 'prj_a',
    metrics: { mode, cacheStatus: 'HIT' },
  });
  expect(dataFetch).toHaveBeenCalledTimes(1);
  expect(streamFetch).toHaveBeenCalledTimes(header === 'flags_prj_a=1' ? 0 : 1);
});

it.each([
  'streaming',
  'polling',
] as const)('a source assessment error allows %s recovery after stale-if-error expires', async (mode) => {
  context('flags_prj_a=2');
  const instance = client('prj_a', {
    stream: mode === 'streaming',
    staleWhileRevalidate: 0,
    staleIfError: 0,
  });
  dataFetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(instance.getDatafile()).rejects.toThrow('Failed to fetch data');
  context('flags_other=2');
  const connection = stream();
  streamFetch.mockResolvedValueOnce(connection.response);
  dataFetch.mockResolvedValueOnce(Response.json(data('prj_a', 2)));
  const evaluation = instance.evaluate('feature');
  await vi.advanceTimersByTimeAsync(0);
  // The snapshot shares the startup the evaluation began without starting its own.
  const reading = instance.getDatafile();
  connection.push({ type: 'datafile', data: data('prj_a', 2) });
  expect(await reading).toMatchObject({
    revision: 2,
    metrics: { mode, cacheStatus: 'HIT' },
  });
  expect(await evaluation).toMatchObject({
    value: false,
    metrics: { mode, cacheStatus: 'HIT' },
  });
  expect(dataFetch).toHaveBeenCalledTimes(mode === 'polling' ? 2 : 1);
  expect(streamFetch).toHaveBeenCalledTimes(mode === 'streaming' ? 1 : 0);
});

it('shares lazy initialization and returns header-aware HITs without fetching', async () => {
  const instance = client();
  const [file, evaluation] = await Promise.all([
    instance.getDatafile(),
    instance.evaluate('feature'),
  ]);
  expect(file).toMatchObject({
    revision: 1,
    fetchedAt: now,
    metrics: { mode: 'vercel', cacheStatus: 'HIT' },
  });
  expect(evaluation).toMatchObject({
    value: true,
    metrics: { mode: 'vercel', cacheStatus: 'HIT' },
  });
  expect(dataFetch).not.toHaveBeenCalled();
  expect(streamFetch).not.toHaveBeenCalled();
});

it('getDatafile returns SWR data and shares its background refresh with evaluations', async () => {
  context('flags_prj_a=2');
  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);
  const backgrounds: Promise<unknown>[] = [];
  const instance = client('prj_a', {
    waitUntil: (promise) => {
      backgrounds.push(promise);
    },
  });
  expect(await instance.getDatafile()).toMatchObject({
    revision: 1,
    metrics: { cacheStatus: 'STALE' },
  });
  const refresh = backgrounds[0];
  expect(refresh).toBeInstanceOf(Promise);
  expect(await instance.evaluate('feature')).toMatchObject({
    value: true,
    metrics: { cacheStatus: 'STALE' },
  });
  expect(dataFetch).toHaveBeenCalledTimes(1);
  pending.resolve(Response.json(data('prj_a', 2)));
  await refresh;
  expect(await instance.getDatafile()).toMatchObject({
    revision: 2,
    metrics: { cacheStatus: 'HIT' },
  });
  expect(dataFetch).toHaveBeenCalledTimes(1);
});

it.each([
  'getDatafile',
  'evaluate',
] as const)('shares one expired blocking refresh when %s starts first', async (method) => {
  context('flags_prj_a=2');
  vi.setSystemTime(now + 10_001);
  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);
  const instance = client();
  const settled = vi.fn();
  const start = (which: typeof method) =>
    (which === 'getDatafile'
      ? instance.getDatafile()
      : instance.evaluate('feature')
    ).then((result) => {
      settled();
      return result;
    });
  const first = start(method);
  const second = start(method === 'getDatafile' ? 'evaluate' : 'getDatafile');
  await vi.advanceTimersByTimeAsync(0);
  expect(dataFetch).toHaveBeenCalledTimes(1);
  expect(settled).not.toHaveBeenCalled();
  pending.resolve(Response.json(data('prj_a', 2)));
  for (const result of await Promise.all([first, second])) {
    expect(result.metrics).toMatchObject({
      mode: 'vercel',
      cacheStatus: 'MISS',
    });
  }
  expect(settled).toHaveBeenCalledTimes(2);
  expect(dataFetch).toHaveBeenCalledTimes(1);
});

it('getDatafile enforces the first failure deadline and performs blocking recovery after expiry', async () => {
  context('flags_prj_a=2');
  const instance = client('prj_a', {
    staleWhileRevalidate: 0,
    staleIfError: 1,
  });
  dataFetch.mockResolvedValueOnce(
    new Response(null, { status: 403, statusText: 'first failure' }),
  );
  expect(await instance.getDatafile()).toMatchObject({
    revision: 1,
    metrics: { cacheStatus: 'STALE' },
  });
  vi.setSystemTime(now + 1_001);
  dataFetch.mockResolvedValueOnce(
    new Response(null, { status: 403, statusText: 'second failure' }),
  );
  await expect(instance.getDatafile()).rejects.toThrow(
    'Failed to fetch data: first failure',
  );
  expect(dataFetch).toHaveBeenCalledTimes(2);
  dataFetch.mockResolvedValueOnce(Response.json(data('prj_a', 2)));
  expect(await instance.getDatafile()).toMatchObject({
    revision: 2,
    metrics: { cacheStatus: 'MISS' },
  });
  expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe('HIT');
  expect(dataFetch).toHaveBeenCalledTimes(3);
});

it('a missing project header starts streaming and a disconnect reconnects without polling', async () => {
  context('flags_other=1');
  const first = stream();
  const second = stream();
  streamFetch
    .mockResolvedValueOnce(first.response)
    .mockResolvedValueOnce(second.response);
  const instance = client('prj_a', { staleIfError: 0 });
  const reading = instance.evaluate('feature');
  first.push({ type: 'datafile', data: data() });
  expect((await reading).metrics?.mode).toBe('streaming');
  expect((await instance.getDatafile()).metrics.mode).toBe('streaming');
  first.close();
  await vi.advanceTimersByTimeAsync(0);
  // The disconnect is failure evidence, but recovery is left to the reconnecting stream.
  await expect(instance.evaluate('feature')).rejects.toThrow(
    'stream: disconnected',
  );
  await expect(instance.getDatafile()).rejects.toThrow('stream: disconnected');
  expect(dataFetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1_000);
  second.push({ type: 'datafile', data: data('prj_a', 2) });
  await vi.advanceTimersByTimeAsync(0);
  expect(await instance.getDatafile()).toMatchObject({
    revision: 2,
    metrics: { mode: 'streaming', cacheStatus: 'HIT' },
  });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(dataFetch).not.toHaveBeenCalled();
  expect(streamFetch).toHaveBeenCalledTimes(2);
});

it('rejects a failed cold fetch without switching sources', async () => {
  context('flags_other=1');
  dataFetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
  const instance = client('prj_a', { datafile: undefined, staleIfError: 0 });
  await expect(instance.getDatafile()).rejects.toThrow('Failed to fetch data');
  expect(dataFetch).toHaveBeenCalledTimes(1);
  expect(streamFetch).not.toHaveBeenCalled();
});

it('serves cached data immediately after a disconnect instead of waiting for a poll', async () => {
  context();
  const connection = stream();
  const reconnect = stream();
  streamFetch
    .mockResolvedValueOnce(connection.response)
    .mockResolvedValueOnce(reconnect.response);
  const instance = client();
  const initial = instance.evaluate('feature');
  connection.push({ type: 'datafile', data: data() });
  await initial;
  connection.close();
  await vi.advanceTimersByTimeAsync(0);

  const [file, evaluation] = await Promise.all([
    instance.getDatafile(),
    instance.evaluate('feature'),
  ]);
  expect(file).toMatchObject({
    revision: 1,
    metrics: {
      mode: 'offline',
      cacheStatus: 'STALE',
      connectionState: 'disconnected',
    },
  });
  expect(evaluation).toMatchObject({
    value: true,
    metrics: { mode: 'offline', cacheStatus: 'STALE' },
  });
  expect(dataFetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1_000);
  reconnect.push({ type: 'datafile', data: data('prj_a', 2) });
  await vi.advanceTimersByTimeAsync(0);
  expect(await instance.getDatafile()).toMatchObject({
    revision: 2,
    metrics: { mode: 'streaming', cacheStatus: 'HIT' },
  });
  expect(dataFetch).not.toHaveBeenCalled();
});

it.each([
  Infinity,
  0,
])('enforces staleIfError %s on reads after a disconnect', async (staleIfError) => {
  context();
  const connection = stream();
  const reconnect = stream();
  streamFetch
    .mockResolvedValueOnce(connection.response)
    .mockResolvedValueOnce(reconnect.response);
  const instance = client('prj_a', { staleIfError });
  const initial = instance.evaluate('feature');
  connection.push({ type: 'datafile', data: data() });
  await initial;
  connection.close();
  await vi.advanceTimersByTimeAsync(0);

  const results = await Promise.allSettled([
    instance.getDatafile(),
    instance.evaluate('feature'),
  ]);
  if (staleIfError === 0) {
    expect(results).toEqual([
      { status: 'rejected', reason: new Error('stream: disconnected') },
      { status: 'rejected', reason: new Error('stream: disconnected') },
    ]);
  } else {
    expect(results).toMatchObject([
      {
        status: 'fulfilled',
        value: {
          revision: 1,
          metrics: { mode: 'offline', cacheStatus: 'STALE' },
        },
      },
      {
        status: 'fulfilled',
        value: {
          value: true,
          metrics: { mode: 'offline', cacheStatus: 'STALE' },
        },
      },
    ]);
  }
  expect(dataFetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1_000);
  reconnect.push({ type: 'datafile', data: data('prj_a', 2) });
  await vi.advanceTimersByTimeAsync(0);
  expect(await instance.getDatafile()).toMatchObject({
    revision: 2,
    metrics: { mode: 'streaming', cacheStatus: 'HIT' },
  });
  expect(dataFetch).not.toHaveBeenCalled();
});

it('shuts down safely while the stream reconnects after a disconnect', async () => {
  context();
  const connection = stream();
  streamFetch.mockResolvedValueOnce(connection.response);
  const instance = client();
  const initial = instance.evaluate('feature');
  connection.push({ type: 'datafile', data: data() });
  await initial;
  connection.close();
  await vi.advanceTimersByTimeAsync(0);
  await instance.shutdown();
  clients.delete(instance);
  await vi.advanceTimersByTimeAsync(30_001);
  expect(dataFetch).not.toHaveBeenCalled();
  expect(streamFetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('starts polling and waits when a missing project header falls back to a stream that gives up', async () => {
  context('flags_other=1');
  streamFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);
  const instance = client();
  const settled = vi.fn();
  const reading = instance.evaluate('feature').then((result) => {
    settled();
    return result;
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).not.toHaveBeenCalled();
  expect(Date.now()).toBe(now);
  expect(dataFetch).toHaveBeenCalledTimes(1);
  expect(streamFetch).toHaveBeenCalledTimes(1);
  pending.resolve(Response.json(data('prj_a', 2)));
  expect(await reading).toMatchObject({
    value: false,
    metrics: { mode: 'polling', cacheStatus: 'HIT' },
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(await instance.getDatafile()).toMatchObject({
    revision: 2,
    metrics: { mode: 'polling', cacheStatus: 'HIT' },
  });
  expect(dataFetch).toHaveBeenCalledTimes(1);
});

it('starts the HTTP refresh only after the stream disconnects and finishes it without polling', async () => {
  context();
  const connection = stream();
  const reconnect = stream();
  streamFetch
    .mockResolvedValueOnce(connection.response)
    .mockResolvedValueOnce(reconnect.response);
  const instance = client();
  const reading = instance.evaluate('feature');
  connection.push({ type: 'datafile', data: data() });
  await reading;
  await vi.advanceTimersByTimeAsync(60_001);
  const pending = deferred<Response>();
  dataFetch.mockReturnValueOnce(pending.promise);
  // While streaming, stale reads serve the cache and leave the refresh to the stream.
  expect((await instance.getDatafile()).metrics.cacheStatus).toBe('STALE');
  expect((await instance.evaluate('feature')).metrics?.cacheStatus).toBe(
    'STALE',
  );
  expect(dataFetch).not.toHaveBeenCalled();
  connection.close();
  await vi.advanceTimersByTimeAsync(0);
  // Degraded reads serve the cache and refresh over HTTP; no poll starts.
  expect((await instance.getDatafile()).metrics).toMatchObject({
    mode: 'offline',
    cacheStatus: 'STALE',
  });
  expect(dataFetch).toHaveBeenCalledTimes(1);
  pending.resolve(Response.json(data('prj_a', 2)));
  await vi.advanceTimersByTimeAsync(0);
  expect((await instance.getDatafile()).revision).toBe(2);
  await vi.advanceTimersByTimeAsync(1_000);
  reconnect.push({ type: 'datafile', data: data('prj_a', 3) });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await instance.getDatafile()).toMatchObject({
    revision: 3,
    metrics: { mode: 'streaming', cacheStatus: 'HIT' },
  });
  expect(dataFetch).toHaveBeenCalledTimes(1);
});

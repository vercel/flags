/** Public API coverage for freshness outside Vercel header mode. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BundledDefinitions,
  createClient,
  type FlagsClient,
} from './index.default';
import { deferred } from './test-utils';
import { readBundledDefinitions } from './utils/read-bundled-definitions';

vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(),
}));
const NOW = 1_700_000_000_000;
const OLD_VERSION = NOW - 365 * 24 * 60 * 60 * 1000;
function datafile(
  configUpdatedAt = OLD_VERSION,
  value = true,
): BundledDefinitions {
  return {
    projectId: 'prj_runtime',
    environment: 'production',
    revision: configUpdatedAt,
    digest: String(configUpdatedAt),
    configUpdatedAt,
    definitions: {
      feature: {
        variants: [false, true],
        environments: { production: value ? 1 : 0 },
      },
    },
  };
}
function stream() {
  let writer!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      writer = controller;
    },
  });
  return {
    response: new Response(body),
    push(message: unknown) {
      writer.enqueue(new TextEncoder().encode(`${JSON.stringify(message)}\n`));
    },
    close() {
      writer.close();
    },
  };
}
const dataFetch = vi.fn<typeof fetch>();
const streamFetch = vi.fn<typeof fetch>();
const clients = new Set<FlagsClient>();
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
function client(
  mode: 'poll' | 'stream',
  options: Parameters<typeof createClient>[1] = {},
) {
  const result = createClient('vf_server_runtime_test', {
    buildStep: false,
    stream: mode === 'stream',
    polling: mode === 'poll',
    staleWhileRevalidate: 1,
    staleIfError: 2,
    fetch: (input, init) => {
      if (String(input).endsWith('/v1/datafile')) return dataFetch(input, init);
      if (String(input).endsWith('/v1/stream')) return streamFetch(input, init);
      if (String(input).endsWith('/v1/ingest'))
        return Promise.resolve(new Response());
      throw new Error(`Unexpected request: ${input}`);
    },
    ...options,
  });
  clients.add(result);
  return result;
}
async function initialized(
  mode: 'poll' | 'stream',
  options: Parameters<typeof createClient>[1] = {},
) {
  const connection = stream();
  streamFetch.mockResolvedValueOnce(connection.response);
  dataFetch.mockImplementation(async () => Response.json(datafile()));
  const instance = client(mode, options);
  const init = instance.initialize();
  if (mode === 'stream')
    connection.push({ type: 'datafile', data: datafile() });
  await init;
  return { instance, connection };
}
beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.stubEnv('VERCEL', '0');
  vi.stubEnv('CI', '');
  vi.stubEnv('NEXT_PHASE', '');
  vi.mocked(readBundledDefinitions).mockResolvedValue({
    state: 'missing-file',
    definitions: null,
  });
  dataFetch.mockReset();
  streamFetch.mockReset();
  streamFetch.mockImplementation(() => new Promise<Response>(() => {}));
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  await Promise.all([...clients].map((instance) => instance.shutdown()));
  clients.clear();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each(['poll', 'stream'] as const)('%s freshness', (mode) => {
  it('serves within SWR, then shares a blocking refresh across evaluation and getDatafile', async () => {
    const { instance, connection } = await initialized(mode);
    const next = stream();
    const pending = deferred<Response>();
    if (mode === 'stream') {
      streamFetch.mockResolvedValueOnce(next.response);
      connection.close();
      await vi.advanceTimersByTimeAsync(0);
    } else dataFetch.mockReturnValueOnce(pending.promise);
    vi.setSystemTime(NOW + 1000);
    expect((await instance.evaluate('feature')).value).toBe(true);
    vi.setSystemTime(NOW + 1001);
    const settled = vi.fn();
    const evaluation = instance.evaluate('feature').then((value) => {
      settled();
      return value;
    });
    const read = instance.getDatafile();
    await vi.advanceTimersByTimeAsync(mode === 'stream' ? 1000 : 0);
    expect(settled).not.toHaveBeenCalled();
    if (mode === 'stream')
      next.push({ type: 'datafile', data: datafile(OLD_VERSION + 1, false) });
    else pending.resolve(Response.json(datafile(OLD_VERSION + 1, false)));
    expect((await evaluation).value).toBe(false);
    expect((await read).configUpdatedAt).toBe(OLD_VERSION + 1);
    expect(mode === 'stream' ? streamFetch : dataFetch).toHaveBeenCalledTimes(
      2,
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('uses the additive error window, then defaults or throws after expiry', async () => {
    const { instance, connection } = await initialized(mode, {
      staleWhileRevalidate: 1,
      staleIfError: 20,
    });
    if (mode === 'stream') {
      connection.close();
      await vi.advanceTimersByTimeAsync(0);
    } else dataFetch.mockRejectedValue(new Error('poll unavailable'));
    vi.setSystemTime(NOW + 1001);
    const stale = instance.evaluate('feature', false);
    await vi.advanceTimersByTimeAsync(mode === 'stream' ? 10_000 : 0);
    expect(await stale).toMatchObject({
      value: true,
      metrics: { cacheStatus: 'STALE' },
    });
    vi.setSystemTime(NOW + 21_001);
    const fallback = instance.evaluate('feature', false);
    const throwing = instance.getDatafile().catch((error: Error) => error);
    const bulk = instance.bulkEvaluate([
      { key: 'feature', defaultValue: false },
    ]);
    await vi.advanceTimersByTimeAsync(mode === 'stream' ? 10_000 : 0);
    expect(await fallback).toMatchObject({ value: false, reason: 'error' });
    expect(await throwing).toBeInstanceOf(Error);
    expect(await bulk).toMatchObject({
      feature: { value: false, reason: 'error' },
    });
    if (mode === 'poll') expect(errorSpy).toHaveBeenCalledTimes(2);
    else expect(errorSpy).not.toHaveBeenCalled();
  });

  it('uses one-minute SWR and unlimited stale-on-error defaults', async () => {
    const { instance, connection } = await initialized(mode, {
      staleWhileRevalidate: undefined,
      staleIfError: undefined,
    });
    if (mode === 'stream') {
      connection.close();
      await vi.advanceTimersByTimeAsync(0);
    } else dataFetch.mockRejectedValue(new Error('unavailable'));
    vi.setSystemTime(NOW + 60_000);
    expect((await instance.evaluate('feature')).value).toBe(true);
    vi.setSystemTime(NOW + 60_001);
    const stale = instance.evaluate('feature');
    await vi.advanceTimersByTimeAsync(mode === 'stream' ? 10_000 : 0);
    expect((await stale).value).toBe(true);
    vi.setSystemTime(NOW + 365 * 24 * 60 * 60 * 1000);
    const expired = instance.evaluate('feature');
    await vi.advanceTimersByTimeAsync(mode === 'stream' ? 10_000 : 0);
    expect(await expired).toMatchObject({
      value: true,
      metrics: { cacheStatus: 'STALE' },
    });
    expect(errorSpy).toHaveBeenCalledTimes(mode === 'poll' ? 2 : 0);
  });

  it.each([
    ['provided', undefined],
    ['provided', Infinity],
    ['bundled', undefined],
    ['bundled', Infinity],
  ] as const)('uses unconfirmed %s data on error with staleIfError=%s', async (origin, staleIfError) => {
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      state: 'ok',
      definitions: datafile(),
    });
    const instance = client(mode, {
      datafile: origin === 'provided' ? datafile() : undefined,
      stream: mode === 'stream' ? { initTimeoutMs: 100 } : false,
      staleIfError,
    });
    dataFetch.mockRejectedValue(new Error('unavailable'));
    const evaluation = instance.evaluate('feature', false);
    await vi.advanceTimersByTimeAsync(mode === 'stream' ? 100 : 0);
    expect(await evaluation).toMatchObject({
      value: true,
      metrics: { cacheStatus: 'STALE' },
    });
    vi.setSystemTime(NOW + 365 * 24 * 60 * 60 * 1000);
    expect((await instance.getDatafile()).configUpdatedAt).toBe(OLD_VERSION);
    expect(
      await instance.bulkEvaluate([{ key: 'feature', defaultValue: false }]),
    ).toMatchObject({ feature: { value: true } });
    expect(errorSpy).toHaveBeenCalledTimes(mode === 'poll' ? 1 : 0);
    expect(warnSpy).toHaveBeenCalledTimes(mode === 'stream' ? 1 : 0);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('uses %s fetchedAt before any confirmation, without resetting its age', async (origin) => {
    const input = { ...datafile(), fetchedAt: NOW };
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      state: 'ok',
      definitions: input,
    });
    const instance = client(mode, {
      datafile: origin === 'provided' ? input : undefined,
      stream: mode === 'stream' ? { initTimeoutMs: 100 } : false,
      staleWhileRevalidate: 1,
      staleIfError: 20,
    });
    dataFetch.mockRejectedValue(new Error('unavailable'));
    const first = instance.evaluate('feature', false);
    await vi.advanceTimersByTimeAsync(mode === 'stream' ? 100 : 0);
    expect((await first).value).toBe(true);
    expect((await instance.getDatafile()).fetchedAt).toBe(NOW);
    vi.setSystemTime(NOW + 1200);
    const stale = instance.evaluate('feature', false);
    await vi.advanceTimersByTimeAsync(mode === 'stream' ? 10_000 : 0);
    expect((await stale).value).toBe(true);
    vi.setSystemTime(NOW + 21_001);
    const expired = instance.evaluate('feature', false);
    await vi.advanceTimersByTimeAsync(mode === 'stream' ? 10_000 : 0);
    expect(await expired).toMatchObject({ value: false, reason: 'error' });
    expect(input.fetchedAt).toBe(NOW);
    expect(errorSpy).toHaveBeenCalledTimes(mode === 'poll' ? 3 : 0);
    expect(warnSpy).toHaveBeenCalledTimes(mode === 'stream' ? 1 : 0);
  });

  it('does not use staleIfError when it is zero', async () => {
    const { instance, connection } = await initialized(mode, {
      staleWhileRevalidate: 0,
      staleIfError: 0,
    });
    if (mode === 'stream') {
      connection.close();
      await vi.advanceTimersByTimeAsync(0);
    } else dataFetch.mockRejectedValue(new Error('poll unavailable'));
    const result = instance.evaluate('feature').catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(mode === 'stream' ? 10_000 : 0);
    expect(await result).toBeInstanceOf(Error);
    if (mode === 'poll') expect(errorSpy).toHaveBeenCalledTimes(1);
    else expect(errorSpy).not.toHaveBeenCalled();
  });

  it('cancels blocked reads on shutdown without stale fallback or late cache updates', async () => {
    const { instance, connection } = await initialized(mode, {
      staleWhileRevalidate: 0,
      staleIfError: 3600,
    });
    const pending = deferred<Response>();
    if (mode === 'stream') {
      connection.close();
      await vi.advanceTimersByTimeAsync(0);
    } else dataFetch.mockReturnValueOnce(pending.promise);
    const result = instance.evaluate('feature').catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(0);
    await instance.shutdown();
    clients.delete(instance);
    expect(await result).toBeInstanceOf(Error);
    pending.resolve(Response.json(datafile(OLD_VERSION + 1)));
    await vi.advanceTimersByTimeAsync(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('polling confirmations', () => {
  it('renews freshness for unchanged polls without changing the cached configuration', async () => {
    const { instance } = await initialized('poll', { staleWhileRevalidate: 1 });
    await vi.advanceTimersByTimeAsync(30_000);
    vi.setSystemTime(NOW + 31_000);
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect(dataFetch).toHaveBeenCalledTimes(2);
    expect((await instance.getDatafile()).configUpdatedAt).toBe(OLD_VERSION);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('joins a scheduled in-flight poll when a read needs confirmation', async () => {
    const { instance } = await initialized('poll', { staleWhileRevalidate: 0 });
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    await vi.advanceTimersByTimeAsync(30_000);
    const read = instance.evaluate('feature');
    await vi.advanceTimersByTimeAsync(0);
    expect(dataFetch).toHaveBeenCalledTimes(2);
    pending.resolve(Response.json(datafile()));
    expect((await read).value).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('rejects regressed responses without renewing freshness or replacing the cache', async () => {
    const { instance } = await initialized('poll', {
      staleWhileRevalidate: 1,
      staleIfError: 1,
    });
    dataFetch.mockImplementation(async () =>
      Response.json(datafile(OLD_VERSION - 1, false)),
    );
    vi.setSystemTime(NOW + 1001);
    expect((await instance.evaluate('feature')).value).toBe(true);
    vi.setSystemTime(NOW + 2001);
    await expect(instance.evaluate('feature')).rejects.toThrow(
      'older datafile',
    );
    dataFetch.mockImplementation(async () => Response.json(datafile()));
    expect((await instance.getDatafile()).configUpdatedAt).toBe(OLD_VERSION);
    expect(dataFetch).toHaveBeenCalledTimes(4);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps polling after initialization failure and recovers on the next interval', async () => {
    const instance = client('poll', { datafile: datafile() });
    dataFetch
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockImplementation(async () => Response.json(datafile()));
    expect(await instance.evaluate('feature', false)).toMatchObject({
      value: false,
      reason: 'error',
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect(dataFetch).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Poll failed:',
      expect.any(Error),
    );
  });

  it('treats transport aborts as refresh failures rather than shutdown', async () => {
    const { instance } = await initialized('poll', {
      staleWhileRevalidate: 0,
      staleIfError: 60,
    });
    dataFetch.mockRejectedValue(
      new DOMException('network aborted', 'AbortError'),
    );
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Poll failed:',
      expect.objectContaining({ name: 'AbortError' }),
    );
  });

  it('bounds a hung poll even when the fetch ignores cancellation', async () => {
    const { instance } = await initialized('poll', {
      staleWhileRevalidate: 0,
      staleIfError: 0,
    });
    const pending = deferred<Response>();
    dataFetch.mockReturnValueOnce(pending.promise);
    const result = instance.evaluate('feature').catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toMatchObject({
      message: expect.stringContaining('deadline'),
    });
    pending.resolve(Response.json(datafile(OLD_VERSION + 1, false)));
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.getDatafile()).configUpdatedAt).toBe(OLD_VERSION);
    expect(dataFetch).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('stream confirmations', () => {
  it('keeps a healthy stream fresh regardless of the age of the configuration', async () => {
    const { instance } = await initialized('stream', {
      staleWhileRevalidate: 0,
      staleIfError: 0,
    });
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect((await instance.getDatafile()).metrics.cacheStatus).toBe('HIT');
    expect(streamFetch).toHaveBeenCalledTimes(1);
    expect(dataFetch).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('releases blocked readers on a primed reconnection even if the version is unchanged', async () => {
    const { instance, connection } = await initialized('stream', {
      staleWhileRevalidate: 0,
    });
    const next = stream();
    streamFetch.mockResolvedValueOnce(next.response);
    connection.close();
    await vi.advanceTimersByTimeAsync(0);
    const settled = vi.fn();
    const read = instance.evaluate('feature').then((result) => {
      settled();
      return result;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).not.toHaveBeenCalled();
    next.push({
      type: 'primed',
      revision: OLD_VERSION,
      projectId: 'prj_runtime',
      environment: 'production',
    });
    expect((await read).value).toBe(true);
    expect((await instance.getDatafile()).metrics.connectionState).toBe(
      'connected',
    );
    expect(streamFetch).toHaveBeenCalledTimes(2);
    expect(dataFetch).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not grant stale freshness to an unconfirmed bundled datafile', async () => {
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      state: 'ok',
      definitions: datafile(),
    });
    const instance = client('stream', { stream: { initTimeoutMs: 100 } });
    const result = instance.evaluate('feature', false);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toMatchObject({ value: false, reason: 'error' });
    await expect(instance.getDatafile()).rejects.toThrow(
      'initialization timeout',
    );
    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Stream initialization timeout, falling back while continuing to connect in the background',
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('static modes', () => {
  it.each([
    'offline',
    'build',
  ] as const)('does not expire %s data even with zero windows', async (mode) => {
    const instance = client('poll', {
      stream: false,
      polling: mode === 'build',
      buildStep: mode === 'build',
      datafile: datafile(),
      staleWhileRevalidate: 0,
      staleIfError: 0,
    });
    vi.setSystemTime(NOW + 365 * 24 * 60 * 60 * 1000);
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect((await instance.getDatafile()).configUpdatedAt).toBe(OLD_VERSION);
    expect(dataFetch).not.toHaveBeenCalled();
    expect(streamFetch).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

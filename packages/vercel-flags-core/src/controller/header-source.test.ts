import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BundledDefinitions } from '../types';
import { getRequestContext } from '../utils/request-context';
import { fetchDatafile } from './fetch-datafile';
import { HeaderSource } from './header-source';
import { type ControllerOptions, normalizeOptions } from './normalized-options';
import { type TaggedData, tagData } from './tagged-data';

vi.mock('../utils/request-context', () => ({ getRequestContext: vi.fn() }));
vi.mock('./fetch-datafile', () => ({ fetchDatafile: vi.fn() }));

const NOW = 1_700_000_000_000;
const V1 = NOW - 365 * 24 * 60 * 60 * 1000;
const PROJECT = 'prj_test';
const HEADER = 'x-vercel-flags-config-versions';
function datafile(configUpdatedAt = V1): BundledDefinitions {
  return {
    projectId: PROJECT,
    environment: 'production',
    definitions: {},
    configUpdatedAt,
    digest: `digest-${configUpdatedAt}`,
    revision: configUpdatedAt,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function setHeader(value?: string, name = HEADER) {
  vi.mocked(getRequestContext).mockReturnValue({
    ctx: {},
    headers: value === undefined ? {} : { [name]: value },
  });
}
function setVersion(value = V1) {
  setHeader(`flags_${PROJECT}=${value}`);
}
let current: TaggedData | undefined;
let source: HeaderSource;
let waitUntil: ReturnType<typeof vi.fn<(promise: Promise<unknown>) => void>>;
function setup(options: Partial<ControllerOptions> = {}) {
  source?.stop();
  source = new HeaderSource(
    normalizeOptions({
      auth: {
        resolveToken: async () => 'test',
        resolveBundledDefinitionsLookup: async () => ({
          type: 'project-id',
          projectId: PROJECT,
        }),
      },
      buildStep: false,
      staleWhileRevalidate: 10,
      staleIfError: 0,
      waitUntil,
      ...options,
    }),
    () => current,
    (data) => {
      current = data;
    },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: NOW });
  waitUntil = vi.fn();
  current = tagData(datafile(), 'provided');
  setVersion();
  vi.mocked(fetchDatafile).mockResolvedValue(datafile(V1 + 1));
  setup();
});
afterEach(() => {
  source.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HeaderSource', () => {
  it.each([
    HEADER,
    'flags-config-versions',
  ])('reads %s and selects the exact project', async (name) => {
    setHeader(
      `flags_other=${V1 + 1}; flags_${PROJECT}_suffix=${V1 + 1}; flags_${PROJECT}=${V1}`,
      name,
    );
    expect(await source.read()).toEqual([current, 'HIT']);
    expect(fetchDatafile).not.toHaveBeenCalled();
  });
  it('prefers the x-vercel header', async () => {
    vi.mocked(getRequestContext).mockReturnValue({
      ctx: {},
      headers: {
        [HEADER]: `flags_${PROJECT}=${V1}`,
        'flags-config-versions': `flags_${PROJECT}=${V1 + 1}`,
      },
    });
    expect((await source.read())[1]).toBe('HIT');
    expect(fetchDatafile).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    '',
    `flags_other=${V1}`,
    `flags_${PROJECT}=`,
    `flags_${PROJECT}=NaN`,
    `flags_${PROJECT}=Infinity`,
    `flags_${PROJECT}=-1`,
    `flags_${PROJECT}=${V1}ms`,
  ])('serves cache without refreshing when the header is unusable: %s', async (header) => {
    setHeader(header);
    expect((await source.read())[1]).toBe('STALE');
    expect(fetchDatafile).not.toHaveBeenCalled();
  });
  it.each([
    'provided',
    'bundled',
  ] as const)('blocks on unknown-age %s data', async (origin) => {
    current = tagData(datafile(), origin);
    setVersion(V1 + 1);
    expect((await source.read())[1]).toBe('MISS');
    expect(fetchDatafile).toHaveBeenCalledTimes(1);
  });
  it.each([
    'header',
    'fetch',
  ] as const)('uses %s freshness rather than the year-old config timestamp', async (freshness) => {
    if (freshness === 'header') await source.read();
    else current = tagData(datafile(), 'fetched');
    vi.setSystemTime(NOW + 10_000);
    setVersion(V1 + 1);
    const pending = deferred<BundledDefinitions>();
    vi.mocked(fetchDatafile).mockReturnValueOnce(pending.promise);
    const old = current;
    expect(await source.read()).toEqual([old, 'STALE']);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    pending.resolve(datafile(V1 + 1));
    await vi.advanceTimersByTimeAsync(0);
    expect(current?.configUpdatedAt).toBe(V1 + 1);
    expect(current?._fetchedAt).toBe(NOW + 10_000);
    expect(old?.configUpdatedAt).toBe(V1);
  });
  it('does not renew freshness from an older matching header after invalidation', async () => {
    await source.read();
    const pending = deferred<BundledDefinitions>();
    vi.mocked(fetchDatafile).mockReturnValueOnce(pending.promise);
    setVersion(V1 + 1);
    await source.read();
    vi.setSystemTime(NOW + 9_000);
    setVersion();
    expect((await source.read())[1]).toBe('HIT');
    vi.setSystemTime(NOW + 10_001);
    setVersion(V1 + 1);
    const settled = vi.fn();
    const read = source.read().then(settled);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    pending.resolve(datafile(V1 + 1));
    await read;
    expect(settled).toHaveBeenCalledTimes(1);
    expect(fetchDatafile).toHaveBeenCalledTimes(1);
  });
  it('releases each zero-SWR reader when its own requirement is met', async () => {
    setup({ staleWhileRevalidate: 0 });
    const first = deferred<BundledDefinitions>();
    const second = deferred<BundledDefinitions>();
    vi.mocked(fetchDatafile)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    setVersion(V1 + 1);
    const a = source.read();
    setVersion(V1 + 2);
    const bSettled = vi.fn();
    const b = source.read().then(bSettled);
    first.resolve(datafile(V1 + 1));
    expect((await a)[0].configUpdatedAt).toBe(V1 + 1);
    expect(bSettled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchDatafile).toHaveBeenCalledTimes(2);
    second.resolve(datafile(V1 + 2));
    await b;
    expect(bSettled).toHaveBeenCalledExactlyOnceWith([current, 'MISS']);
  });
  it('automatically catches up after serving a newer reader stale data', async () => {
    await source.read();
    const first = deferred<BundledDefinitions>();
    vi.mocked(fetchDatafile)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(datafile(V1 + 2));
    setVersion(V1 + 1);
    expect((await source.read())[1]).toBe('STALE');
    setVersion(V1 + 2);
    expect((await source.read())[1]).toBe('STALE');
    first.resolve(datafile(V1 + 1));
    await vi.advanceTimersByTimeAsync(100);
    expect(current?.configUpdatedAt).toBe(V1 + 2);
    expect(fetchDatafile).toHaveBeenCalledTimes(2);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0]![0];
  });
  it('allows a blocked newer reader to serve a newly fetched version within SWR', async () => {
    const first = deferred<BundledDefinitions>();
    const second = deferred<BundledDefinitions>();
    vi.mocked(fetchDatafile)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    setVersion(V1 + 1);
    const a = source.read();
    setVersion(V1 + 2);
    const b = source.read();
    first.resolve(datafile(V1 + 1));
    expect((await a)[1]).toBe('MISS');
    expect((await b)[1]).toBe('STALE');
    await vi.advanceTimersByTimeAsync(100);
    second.resolve(datafile(V1 + 2));
    await waitUntil.mock.calls[0]![0];
    expect(fetchDatafile).toHaveBeenCalledTimes(2);
  });
  it.each([
    0, -1,
  ])('never regresses cache or renews freshness for response delta %s', async (delta) => {
    setup({ staleWhileRevalidate: 0 });
    current = tagData(datafile(), 'fetched');
    const original = current;
    setVersion(V1 + 1);
    vi.mocked(fetchDatafile).mockResolvedValue(datafile(V1 + delta));
    const outcome = source.read().catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(300);
    expect(await outcome).toBeInstanceOf(Error);
    expect(current).toBe(original);
    expect(current?._fetchedAt).toBe(NOW);
    expect(fetchDatafile).toHaveBeenCalledTimes(3);
  });
  it('can serve a newly accepted version within SWR even when the final attempt falls behind', async () => {
    setVersion(V1 + 2);
    vi.mocked(fetchDatafile)
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(datafile(V1 + 1));
    const read = source.read();
    await vi.advanceTimersByTimeAsync(300);
    expect(await read).toEqual([current, 'STALE']);
    expect(current?.configUpdatedAt).toBe(V1 + 1);
    expect(fetchDatafile).toHaveBeenCalledTimes(3);
  });
  it('retries failures with backoff and stops at three attempts', async () => {
    setVersion(V1 + 1);
    const failure = new Error('unavailable');
    vi.mocked(fetchDatafile).mockRejectedValue(failure);
    const outcome = source.read().catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(99);
    expect(fetchDatafile).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchDatafile).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(await outcome).toBe(failure);
    expect(fetchDatafile).toHaveBeenCalledTimes(3);
    vi.mocked(fetchDatafile).mockResolvedValue(datafile(V1 + 1));
    expect((await source.read())[1]).toBe('MISS');
    expect(fetchDatafile).toHaveBeenCalledTimes(4);
  });
  it('enforces the overall deadline even if transport ignores cancellation', async () => {
    setVersion(V1 + 1);
    const pending = deferred<BundledDefinitions>();
    vi.mocked(fetchDatafile).mockReturnValueOnce(pending.promise);
    const outcome = source.read().catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await outcome).toMatchObject({
      message: expect.stringContaining('deadline'),
    });
    expect(vi.mocked(fetchDatafile).mock.calls[0]![0].signal?.aborted).toBe(
      true,
    );
    pending.resolve(datafile(V1 + 1));
    await vi.advanceTimersByTimeAsync(0);
    expect(current?.configUpdatedAt).toBe(V1);
  });
  it.each([
    10_300, 10_299, 0,
  ])('applies staleIfError=%s at failure time', async (window) => {
    setup({ staleWhileRevalidate: 0, staleIfError: window / 1000 });
    await source.read();
    vi.setSystemTime(NOW + 10_000);
    setVersion(V1 + 1);
    vi.mocked(fetchDatafile).mockRejectedValue(new Error('failed'));
    const outcome = source.read().catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(300);
    if (window === 10_300) expect(await outcome).toEqual([current, 'STALE']);
    else expect(await outcome).toBeInstanceOf(Error);
    expect(fetchDatafile).toHaveBeenCalledTimes(3);
  });
  it('applies staleIfError to transport abort errors, while reserving cancellation for shutdown', async () => {
    setup({ staleWhileRevalidate: 0, staleIfError: 60 });
    await source.read();
    setVersion(V1 + 1);
    vi.mocked(fetchDatafile).mockRejectedValue(
      new DOMException('Transport aborted', 'AbortError'),
    );
    const read = source.read();
    await vi.advanceTimersByTimeAsync(300);
    expect(await read).toEqual([current, 'STALE']);
    expect(fetchDatafile).toHaveBeenCalledTimes(3);
  });
  it('does not treat unknown-age data as usable on error', async () => {
    setup({ staleIfError: 60 });
    setVersion(V1 + 1);
    vi.mocked(fetchDatafile).mockRejectedValue(new Error('failed'));
    const outcome = source.read().catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(300);
    expect(await outcome).toBeInstanceOf(Error);
  });
  it('logs background exhaustion once and tolerates waitUntil registration errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    waitUntil.mockImplementation(() => {
      throw new Error('no context');
    });
    await source.read();
    setVersion(V1 + 1);
    const failure = new Error('failed');
    vi.mocked(fetchDatafile).mockRejectedValue(failure);
    await Promise.all([source.read(), source.read()]);
    await vi.advanceTimersByTimeAsync(300);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Header refresh failed:',
      failure,
    );
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
  it('captures each cold read header before awaiting the first fetch', async () => {
    setup({ staleWhileRevalidate: 0 });
    current = undefined;
    const pending = deferred<BundledDefinitions>();
    vi.mocked(fetchDatafile)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(datafile(V1 + 2));
    setVersion(V1 + 2);
    const read = source.read();
    setVersion(V1);
    pending.resolve(datafile(V1));
    await vi.advanceTimersByTimeAsync(0);
    expect((await read)[0].configUpdatedAt).toBe(V1 + 2);
    expect(fetchDatafile).toHaveBeenCalledTimes(2);
  });
  it('continues a cold refresh in the background after discovering its project', async () => {
    current = undefined;
    const pending = deferred<BundledDefinitions>();
    vi.mocked(fetchDatafile)
      .mockResolvedValueOnce(datafile())
      .mockReturnValueOnce(pending.promise);
    setVersion(V1 + 1);
    expect((await source.read())[1]).toBe('STALE');
    expect(fetchDatafile).toHaveBeenCalledTimes(2);
    pending.resolve(datafile(V1 + 1));
    await waitUntil.mock.calls[0]![0];
    expect((current as TaggedData | undefined)?.configUpdatedAt).toBe(V1 + 1);
  });
  it('aborts blocking reads without stale fallback and ignores late responses', async () => {
    setup({ staleWhileRevalidate: 0, staleIfError: 60 });
    await source.read();
    setVersion(V1 + 1);
    const pending = deferred<BundledDefinitions>();
    vi.mocked(fetchDatafile).mockReturnValueOnce(pending.promise);
    const outcome = source.read().catch((error: Error) => error);
    source.stop();
    expect(await outcome).toMatchObject({ name: 'AbortError' });
    const restarted = source.read();
    pending.resolve(datafile(V1 + 100));
    expect((await restarted)[0].configUpdatedAt).toBe(V1 + 1);
    expect(current?.configUpdatedAt).toBe(V1 + 1);
    expect(fetchDatafile).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatafileInput } from '../types';
import { getRequestContext } from '../utils/request-context';
import { Authentication } from './auth';
import {
  type CacheReadPolicy,
  DatafileCache,
  Freshness,
} from './datafile-cache';
import { fetchDatafile } from './fetch-datafile';
import { HeaderSource } from './header-source';
import { normalizeOptions } from './normalized-options';
import { tagData } from './tagged-data';

vi.mock('../utils/request-context', () => ({ getRequestContext: vi.fn() }));
vi.mock('./fetch-datafile', () => ({ fetchDatafile: vi.fn() }));

function data(configUpdatedAt = 1): DatafileInput {
  return {
    projectId: 'prj_policy',
    environment: 'production',
    definitions: {},
    configUpdatedAt,
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ now: 1_000 });
  vi.mocked(getRequestContext).mockReset();
  vi.mocked(getRequestContext).mockReturnValue({
    ctx: undefined,
    headers: undefined,
  });
  vi.mocked(fetchDatafile).mockReset();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  try {
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

describe('cache read callbacks', () => {
  it.each(
    Object.values(Freshness),
  )('serves %s without fetching when fetch is omitted, subject to SIE', async (status) => {
    const cache = new DatafileCache(0);
    const original = tagData(data(), 'provided');
    cache.seed(original);
    const policy = { getStatus: vi.fn(() => status) };
    expect(await cache.resolve(policy)).toEqual([
      original,
      status === Freshness.Fresh ? 'HIT' : 'STALE',
    ]);
    const error = new Error('outage');
    cache.fail(error);
    await expect(cache.resolve(policy)).rejects.toBe(error);
    expect(policy.getStatus).toHaveBeenCalledTimes(2);
  });

  it('returns undefined without assessing an empty cache when fetch is omitted', async () => {
    const cache = new DatafileCache();
    const getStatus = vi.fn(() => Freshness.Fresh);
    expect(await cache.resolve({ getStatus })).toBeUndefined();
    expect(getStatus).not.toHaveBeenCalled();
  });

  it.each([
    Freshness.Fresh,
    Freshness.Unknown,
  ])('serves a %s assessment without fetching or clearing a failure', async (status) => {
    const cache = new DatafileCache(0);
    const original = tagData(data(), 'provided');
    cache.seed(original);
    const policy = {
      getStatus: vi.fn(() => status),
      fetch: vi.fn(async () => {}),
    };

    expect(await cache.resolve(policy)).toEqual([
      original,
      status === Freshness.Fresh ? 'HIT' : 'STALE',
    ]);
    expect(policy.getStatus).toHaveBeenCalledExactlyOnceWith({
      projectId: 'prj_policy',
      environment: 'production',
      configUpdatedAt: 1,
      revision: undefined,
      ageMs: Infinity,
    });
    const failure = new Error('outage');
    cache.fail(failure);
    await expect(cache.resolve(policy)).rejects.toBe(failure);
    expect(policy.getStatus).toHaveBeenCalledTimes(2);
    expect(policy.fetch).not.toHaveBeenCalled();
  });

  it('blocks expired reads even when no failure exists', async () => {
    const waitUntil = vi.fn();
    const cache = new DatafileCache(Infinity, waitUntil);
    cache.seed(tagData(data(), 'provided'));
    const pending = deferred();
    const fetch = vi.fn(async () => {
      await pending.promise;
      cache.updateFromSource(data(2), 'fetched');
    });
    const settled = vi.fn();
    const reading = cache
      .resolve({ getStatus: () => Freshness.Expired, fetch })
      .then(settled);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
    expect(waitUntil).not.toHaveBeenCalled();
    pending.resolve();
    await reading;
    expect(settled).toHaveBeenCalledExactlyOnceWith([cache.read(), 'MISS']);
    expect(cache.read()?.configUpdatedAt).toBe(2);
  });

  it('keeps the first fetch failure and its inclusive deadline across later attempts', async () => {
    const cache = new DatafileCache(100);
    const original = tagData(data(), 'provided');
    cache.seed(original);
    const firstError = new Error('first outage');
    const fetch = vi
      .fn<NonNullable<CacheReadPolicy['fetch']>>()
      .mockRejectedValueOnce(firstError)
      .mockRejectedValue(new Error('later outage'));
    const policy = { getStatus: () => Freshness.Expired, fetch };
    expect(await cache.resolve(policy)).toEqual([original, 'STALE']);
    vi.setSystemTime(1_100);
    expect(await cache.resolve(policy)).toEqual([original, 'STALE']);
    vi.setSystemTime(1_101);
    await expect(cache.resolve(policy)).rejects.toBe(firstError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('normalizes non-Error failures retained by the cache', async () => {
    const cache = new DatafileCache(0);
    cache.seed(tagData(data(), 'provided'));
    const fetch = vi.fn().mockRejectedValue('transport failed');
    await expect(
      cache.resolve({ getStatus: () => Freshness.Expired, fetch }),
    ).rejects.toThrow('Unknown fetch error');
    expect(() => cache.read()).toThrow('Unknown fetch error');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps background fetching handled when waitUntil registration throws', async () => {
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>(() => {
      throw new Error('registration failed');
    });
    const cache = new DatafileCache(0, waitUntil);
    const original = tagData(data(), 'provided');
    cache.seed(original);
    const failure = new Error('fetch failed');
    const fetch = vi.fn().mockRejectedValue(failure);
    expect(
      await cache.resolve({ getStatus: () => Freshness.Stale, fetch }),
    ).toEqual([original, 'STALE']);
    await waitUntil.mock.calls[0]?.[0];
    expect(waitUntil).toHaveBeenCalledExactlyOnceWith(expect.any(Promise));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Revalidation failed:',
      failure,
    );
    errorSpy.mockClear();
    expect(() => cache.read()).toThrow(failure);
  });

  it('shares a background refresh with a later blocking read', async () => {
    const waitUntil = vi.fn();
    const cache = new DatafileCache(Infinity, waitUntil);
    const original = tagData(data(), 'provided');
    cache.seed(original);
    const pending = deferred();
    const fetch = vi.fn(async () => {
      await pending.promise;
      cache.updateFromSource(data(2), 'fetched');
    });
    const policy = { getStatus: () => Freshness.Stale, fetch };
    expect(await cache.resolve(policy)).toEqual([original, 'STALE']);
    expect(waitUntil).toHaveBeenCalledExactlyOnceWith(expect.any(Promise));
    const settled = vi.fn();
    const blocking = cache
      .resolve({ ...policy, getStatus: () => Freshness.Expired })
      .then((result) => {
        settled();
        return result;
      });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));

    pending.resolve();
    expect(await blocking).toEqual([cache.read(), 'MISS']);
    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
    expect(cache.read()?.configUpdatedAt).toBe(2);
  });

  it('uses the failure deadline even when the callback still permits stale serving', async () => {
    const waitUntil = vi.fn();
    const cache = new DatafileCache(0, waitUntil);
    cache.seed(tagData(data(), 'provided'));
    const failure = new Error('refresh failed');
    const fetch = vi
      .fn<NonNullable<CacheReadPolicy['fetch']>>()
      .mockRejectedValueOnce(failure);
    const policy = { getStatus: () => Freshness.Stale, fetch };

    expect((await cache.resolve(policy))?.[1]).toBe('STALE');
    await waitUntil.mock.calls[0]?.[0];
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Revalidation failed:',
      failure,
    );
    errorSpy.mockClear();
    expect(() => cache.read()).toThrow(failure);

    fetch.mockImplementationOnce(async () =>
      cache.updateFromSource(data(2), 'fetched'),
    );
    expect((await cache.resolve(policy))?.[1]).toBe('MISS');
    expect(cache.read()?.configUpdatedAt).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it('contains synchronous fetch failures and permits a later retry', async () => {
    const cache = new DatafileCache();
    const failure = new Error('synchronous failure');
    const fetch = vi.fn<NonNullable<CacheReadPolicy['fetch']>>(() => {
      throw failure;
    });
    const policy = { getStatus: () => Freshness.Expired, fetch };
    await expect(cache.resolve(policy)).rejects.toBe(failure);
    fetch.mockImplementationOnce(async () =>
      cache.updateFromSource(data(), 'fetched'),
    );
    expect((await cache.resolve(policy))?.[1]).toBe('MISS');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('cancels queued fetch without invoking the callback', async () => {
    const cache = new DatafileCache();
    const fetch = vi.fn(async () => {});
    const reading = cache.resolve({
      getStatus: () => Freshness.Expired,
      fetch,
    });
    const outcome = expect(reading).rejects.toThrow();
    cache.clear();
    await outcome;
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not let cancelled work fail or clear a newer fetch', async () => {
    const cache = new DatafileCache(0);
    cache.seed(tagData(data(), 'provided'));
    const oldPending = deferred();
    const nextPending = deferred();
    const fetch = vi
      .fn<NonNullable<CacheReadPolicy['fetch']>>()
      .mockImplementationOnce(() => oldPending.promise)
      .mockImplementationOnce(async (signal) => {
        await nextPending.promise;
        signal.throwIfAborted();
        cache.updateFromSource(data(2), 'fetched');
      });
    const policy = { getStatus: () => Freshness.Expired, fetch };
    const oldRead = cache.resolve(policy);
    const cancelled = expect(oldRead).rejects.toThrow('cancelled transport');
    await vi.advanceTimersByTimeAsync(0);
    const oldSignal = fetch.mock.calls[0]?.[0];
    cache.clear();
    cache.seed(tagData(data(), 'provided'));
    const nextRead = cache.resolve(policy);
    await vi.advanceTimersByTimeAsync(0);
    oldPending.reject(new Error('cancelled transport'));
    await cancelled;
    expect(oldSignal?.aborted).toBe(true);
    expect(cache.read()?.configUpdatedAt).toBe(1);

    const sharedRead = cache.resolve(policy);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    nextPending.resolve();
    expect(await Promise.all([nextRead, sharedRead])).toEqual([
      [cache.read(), 'MISS'],
      [cache.read(), 'MISS'],
    ]);
    expect(cache.read()?.configUpdatedAt).toBe(2);
  });
});

describe('header freshness policy', () => {
  function source(staleWhileRevalidate = 1) {
    return new HeaderSource(
      normalizeOptions({
        auth: new Authentication(undefined),
        vercel: true,
        staleWhileRevalidate,
      }),
    );
  }

  function statusCheck(headerSource: HeaderSource, header: string | undefined) {
    vi.mocked(getRequestContext).mockReturnValue({
      ctx: undefined,
      headers:
        header === undefined
          ? undefined
          : { 'x-vercel-flags-config-versions': header },
    });
    return headerSource.getStatusCheck();
  }

  it.each([
    undefined,
    '',
    'flags_other=2',
    'flags_prj_policy=invalid',
    'flags_prj_policy=0',
    'flags_prj_policy=-1',
    'flags_prj_policy=Infinity',
  ])('treats missing or malformed header %s as unknown', (header) => {
    const headerSource = source();
    const confirmed = vi.fn();
    headerSource.on('confirmed', confirmed);
    expect(statusCheck(headerSource, header)({ ...data(), ageMs: 0 })).toBe(
      Freshness.Unknown,
    );
    expect(confirmed).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    '',
    'invalid',
    NaN,
    Infinity,
    0,
  ])('treats missing or invalid cached timestamp %s as unknown', (configUpdatedAt) => {
    const headerSource = source();
    const confirmed = vi.fn();
    headerSource.on('confirmed', confirmed);
    expect(
      statusCheck(
        headerSource,
        'flags_prj_policy=2',
      )({
        ...data(),
        configUpdatedAt,
        ageMs: 0,
      }),
    ).toBe(Freshness.Unknown);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it.each([
    [1, 2, Infinity, 1, Freshness.Fresh],
    [2, 2, Infinity, 1, Freshness.Fresh],
    [3, 2, 0, 1, Freshness.Stale],
    [3, 2, 1_000, 1, Freshness.Stale],
    [3, 2, 1_001, 1, Freshness.Expired],
    [3, 2, Infinity, 1, Freshness.Expired],
    [3, 2, 0, 0, Freshness.Expired],
    [3, 2, 500, 0.5, Freshness.Stale],
    [3, 2, 501, 0.5, Freshness.Expired],
  ])('assesses header %s against timestamp %s with age %s and SWR %s as %s', (headerTs, currentTs, ageMs, swr, status) => {
    const headerSource = source(swr);
    const confirmed = vi.fn();
    headerSource.on('confirmed', confirmed);
    const metadata = { ...data(currentTs), ageMs };
    expect(
      statusCheck(
        headerSource,
        `flags_other=99; flags_prj_policy=${headerTs}`,
      )(metadata),
    ).toBe(status);
    expect(confirmed).toHaveBeenCalledTimes(headerTs === currentTs ? 1 : 0);
  });

  it('resets cache age on an equal highest-observed header, then blocks older confirmations until stop', async () => {
    const cache = new DatafileCache(0);
    const original = Object.freeze(
      tagData({ ...data(), fetchedAt: 500 }, 'bundled'),
    );
    cache.seed(original);
    const headerSource = source();
    const confirmed = vi.fn((metadata) => cache.tryConfirm(metadata));
    headerSource.on('confirmed', confirmed);
    expect(
      await cache.resolve({
        getStatus: statusCheck(headerSource, 'flags_prj_policy=1'),
      }),
    ).toEqual([original, 'HIT']);
    expect(cache.ageMs).toBe(0);
    expect(original.fetchedAt).toBe(500);
    expect(original._origin).toBe('bundled');
    expect(confirmed).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_100);
    expect(
      await cache.resolve({
        getStatus: statusCheck(headerSource, 'flags_prj_policy=2'),
      }),
    ).toEqual([original, 'STALE']);
    const error = new Error('outage');
    cache.fail(error);
    await expect(
      cache.resolve({
        getStatus: statusCheck(headerSource, 'flags_prj_policy=1'),
      }),
    ).rejects.toBe(error);
    expect(cache.ageMs).toBe(100);
    expect(confirmed).toHaveBeenCalledTimes(1);

    headerSource.stop();
    expect(
      await cache.resolve({
        getStatus: statusCheck(headerSource, 'flags_prj_policy=1'),
      }),
    ).toEqual([original, 'HIT']);
    expect(cache.ageMs).toBe(0);
    expect(confirmed).toHaveBeenCalledTimes(2);
    expect(original.fetchedAt).toBe(500);
  });

  it('assesses the captured raw header after a shared cold fetch discovers the project', async () => {
    const cache = new DatafileCache(0);
    const headerSource = source();
    const confirmed = vi.fn((metadata) => cache.tryConfirm(metadata));
    headerSource.on('confirmed', confirmed);
    const headers = { 'x-vercel-flags-config-versions': 'flags_prj_policy=2' };
    vi.mocked(getRequestContext).mockReturnValue({ ctx: undefined, headers });
    const originalCheck = vi.fn(headerSource.getStatusCheck());
    const pending = deferred();
    const fetch = vi.fn(async () => {
      await pending.promise;
      cache.updateFromSource(data(), 'fetched');
    });
    const firstRead = cache.resolve({ getStatus: originalCheck, fetch });
    headers['x-vercel-flags-config-versions'] = 'flags_prj_policy=1';
    const laterCheck = vi.fn(headerSource.getStatusCheck());
    const secondRead = cache.resolve({ getStatus: laterCheck, fetch });
    await vi.advanceTimersByTimeAsync(0);
    expect(originalCheck).not.toHaveBeenCalled();
    expect(laterCheck).not.toHaveBeenCalled();
    pending.resolve();
    expect(await Promise.all([firstRead, secondRead])).toEqual([
      [cache.read(), 'MISS'],
      [cache.read(), 'MISS'],
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(originalCheck).toHaveReturnedWith(Freshness.Stale);
    expect(laterCheck).toHaveReturnedWith(Freshness.Fresh);
    expect(originalCheck).toHaveBeenCalledTimes(1);
    expect(laterCheck).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();

    vi.setSystemTime(1_100);
    cache.fail(new Error('outage'));
    await expect(cache.resolve({ getStatus: laterCheck })).rejects.toThrow(
      'outage',
    );
    expect(cache.ageMs).toBe(100);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('accepts the fallback header and gives the Vercel header precedence', () => {
    const headerSource = source();
    vi.mocked(getRequestContext).mockReturnValue({
      ctx: undefined,
      headers: { 'flags-config-versions': 'flags_prj_policy=1' },
    });
    expect(headerSource.getStatusCheck()({ ...data(), ageMs: Infinity })).toBe(
      Freshness.Fresh,
    );
    vi.mocked(getRequestContext).mockReturnValue({
      ctx: undefined,
      headers: {
        'x-vercel-flags-config-versions': 'flags_prj_policy=2',
        'flags-config-versions': 'flags_prj_policy=1',
      },
    });
    expect(headerSource.getStatusCheck()({ ...data(), ageMs: Infinity })).toBe(
      Freshness.Expired,
    );
  });

  it('emits raw fetched data and confirms equal responses without changing fetchedAt', async () => {
    const cache = new DatafileCache();
    const original = Object.freeze(
      tagData({ ...data(), fetchedAt: 500 }, 'bundled'),
    );
    cache.seed(original);
    const headerSource = source();
    const onData = vi.fn((raw) => cache.updateFromSource(raw, 'fetched'));
    headerSource.on('data', onData);
    const incoming = Object.freeze({
      ...data(),
      configUpdatedAt: 1,
      revision: 1,
      digest: 'test',
    });
    vi.mocked(fetchDatafile).mockResolvedValue(incoming);
    const fetch = headerSource.fetch;
    const signal = new AbortController().signal;
    vi.setSystemTime(2_000);
    await fetch(signal);
    expect(onData).toHaveBeenCalledExactlyOnceWith(incoming);
    expect(onData.mock.calls[0]?.[0]).toBe(incoming);
    expect(fetchDatafile).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ signal }),
    );
    expect(cache.read()).toBe(original);
    expect(cache.ageMs).toBe(0);
    expect(original.fetchedAt).toBe(500);
    expect(original._origin).toBe('bundled');
    expect(incoming).not.toHaveProperty('_origin');
    expect(incoming).not.toHaveProperty('fetchedAt');
    expect(
      await cache.resolve({
        getStatus: statusCheck(headerSource, 'flags_prj_policy=2'),
      }),
    ).toEqual([original, 'STALE']);
  });

  it('suppresses a successful transport response after cache clear cancels the fetch', async () => {
    const cache = new DatafileCache(0);
    const headerSource = source();
    const pending = deferred();
    vi.mocked(fetchDatafile).mockImplementation(async () => {
      await pending.promise;
      return { ...data(2), configUpdatedAt: 2, revision: 2, digest: 'test' };
    });
    const onData = vi.fn((raw) => cache.updateFromSource(raw, 'fetched'));
    headerSource.on('data', onData);
    const reading = cache.resolve({
      getStatus: statusCheck(headerSource, 'flags_prj_policy=2'),
      fetch: headerSource.fetch,
    });
    const outcome = expect(reading).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchDatafile).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(fetchDatafile).mock.calls[0]?.[0].signal;
    cache.clear();
    pending.resolve();
    await outcome;
    expect(signal?.aborted).toBe(true);
    expect(onData).not.toHaveBeenCalled();
    expect(cache.read()).toBeUndefined();
    expect(cache.ageMs).toBe(Infinity);
    const replacement = tagData(data(), 'provided');
    cache.seed(replacement);
    expect(cache.read()).toBe(replacement);
  });
});

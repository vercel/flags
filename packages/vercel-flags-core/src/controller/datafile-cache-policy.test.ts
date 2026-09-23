import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatafileInput } from '../types';
import {
  type CacheReadPolicy,
  DatafileCache,
  Freshness,
} from './datafile-cache';
import { tagData } from './tagged-data';

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

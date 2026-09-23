import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatafileInput } from '../types';
import { type CacheReadPolicy, DatafileCache } from './datafile-cache';
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
  it.each([
    true,
    undefined,
  ])('serves a %s assessment without revalidating or clearing a failure', async (fresh) => {
    const cache = new DatafileCache(0);
    const original = tagData(data(), 'provided');
    cache.seed(original);
    const policy = {
      isFresh: vi.fn(() => fresh),
      isStale: vi.fn(() => true),
      revalidate: vi.fn(async () => {}),
    };

    expect(await cache.resolve(policy)).toEqual([
      original,
      fresh ? 'HIT' : 'STALE',
    ]);
    expect(policy.isFresh).toHaveBeenCalledExactlyOnceWith({
      projectId: 'prj_policy',
      environment: 'production',
      configUpdatedAt: 1,
      revision: undefined,
      fetchedAt: undefined,
    });
    const failure = new Error('outage');
    cache.fail(failure);
    await expect(cache.resolve(policy)).rejects.toBe(failure);
    expect(policy.isStale).not.toHaveBeenCalled();
    expect(policy.revalidate).not.toHaveBeenCalled();
  });

  it('shares a background refresh with a later blocking read', async () => {
    const waitUntil = vi.fn();
    const cache = new DatafileCache(Infinity, waitUntil);
    const original = tagData(data(), 'provided');
    cache.seed(original);
    const pending = deferred();
    const revalidate = vi.fn(async () => {
      await pending.promise;
      cache.updateFromSource(data(2), 'fetched');
    });
    const policy = { isFresh: () => false, isStale: () => true, revalidate };
    expect(await cache.resolve(policy)).toEqual([original, 'STALE']);
    expect(waitUntil).toHaveBeenCalledExactlyOnceWith(expect.any(Promise));
    const settled = vi.fn();
    const blocking = cache
      .resolve({ ...policy, isStale: () => false })
      .then((result) => {
        settled();
        return result;
      });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    expect(revalidate).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));

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
    const revalidate = vi
      .fn<NonNullable<CacheReadPolicy['revalidate']>>()
      .mockRejectedValueOnce(failure);
    const policy = { isFresh: () => false, isStale: () => true, revalidate };

    expect((await cache.resolve(policy))?.[1]).toBe('STALE');
    await waitUntil.mock.calls[0]?.[0];
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Revalidation failed:',
      failure,
    );
    errorSpy.mockClear();
    expect(() => cache.read()).toThrow(failure);

    revalidate.mockImplementationOnce(async () =>
      cache.updateFromSource(data(2), 'fetched'),
    );
    expect((await cache.resolve(policy))?.[1]).toBe('MISS');
    expect(cache.read()?.configUpdatedAt).toBe(2);
    expect(revalidate).toHaveBeenCalledTimes(2);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it('contains synchronous revalidation failures and permits a later retry', async () => {
    const cache = new DatafileCache();
    const failure = new Error('synchronous failure');
    const revalidate = vi.fn<NonNullable<CacheReadPolicy['revalidate']>>(() => {
      throw failure;
    });
    const policy = { isFresh: () => false, isStale: () => false, revalidate };
    await expect(cache.resolve(policy)).rejects.toBe(failure);
    revalidate.mockImplementationOnce(async () =>
      cache.updateFromSource(data(), 'fetched'),
    );
    expect((await cache.resolve(policy))?.[1]).toBe('MISS');
    expect(revalidate).toHaveBeenCalledTimes(2);
  });

  it('cancels queued revalidation without invoking the callback', async () => {
    const cache = new DatafileCache();
    const revalidate = vi.fn(async () => {});
    const reading = cache.resolve({
      isFresh: () => false,
      isStale: () => false,
      revalidate,
    });
    const outcome = expect(reading).rejects.toThrow();
    cache.clear();
    await outcome;
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('does not let cancelled work fail or clear a newer revalidation', async () => {
    const cache = new DatafileCache(0);
    cache.seed(tagData(data(), 'provided'));
    const oldPending = deferred();
    const nextPending = deferred();
    const revalidate = vi
      .fn<NonNullable<CacheReadPolicy['revalidate']>>()
      .mockImplementationOnce(() => oldPending.promise)
      .mockImplementationOnce(async (signal) => {
        await nextPending.promise;
        signal.throwIfAborted();
        cache.updateFromSource(data(2), 'fetched');
      });
    const policy = { isFresh: () => false, isStale: () => false, revalidate };
    const oldRead = cache.resolve(policy);
    const cancelled = expect(oldRead).rejects.toThrow('cancelled transport');
    await vi.advanceTimersByTimeAsync(0);
    const oldSignal = revalidate.mock.calls[0]?.[0];
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
    expect(revalidate).toHaveBeenCalledTimes(2);
    nextPending.resolve();
    expect(await Promise.all([nextRead, sharedRead])).toEqual([
      [cache.read(), 'MISS'],
      [cache.read(), 'MISS'],
    ]);
    expect(cache.read()?.configUpdatedAt).toBe(2);
  });
});

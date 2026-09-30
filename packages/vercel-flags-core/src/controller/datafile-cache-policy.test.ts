import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatafileInput } from '../types';
import { getRequestContext } from '../utils/request-context';
import { Authentication } from './auth';
import { type CacheFetch, DatafileCache } from './datafile-cache';
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

const neverSettlingFetch: CacheFetch = () => new Promise(() => {});

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
  it.each([
    'fresh',
    'unknown',
  ] as const)('serves a %s assessment without fetching or clearing a failure', async (status) => {
    const fetch = vi.fn<CacheFetch>();
    const cache = new DatafileCache(fetch, 0);
    const original = tagData(data(), 'provided');
    cache.seed(original);
    const policy = {
      assess: vi.fn(() => ({ status })),
    };

    expect(await cache.resolve(policy)).toEqual([
      original,
      status === 'fresh' ? 'HIT' : 'STALE',
    ]);
    expect(policy.assess).toHaveBeenCalledExactlyOnceWith({
      projectId: 'prj_policy',
      environment: 'production',
      configUpdatedAt: 1,
      revision: undefined,
      ageMs: Infinity,
    });
    const failure = new Error('outage');
    cache.fail(failure);
    await expect(cache.resolve(policy)).rejects.toBe(failure);
    expect(policy.assess).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks expired reads even when no failure exists', async () => {
    const waitUntil = vi.fn();
    const pending = deferred();
    const fetch = vi.fn(async () => {
      await pending.promise;
      return data(2);
    });
    const cache = new DatafileCache(fetch, Infinity, waitUntil);
    cache.seed(tagData(data(), 'provided'));
    const settled = vi.fn();
    const reading = cache
      .resolve({ assess: () => ({ status: 'expired' as const }) })
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

  it('keeps the first source failure and its inclusive deadline without extra attempts', async () => {
    const firstError = new Error('first outage');
    const laterError = new Error('later outage');
    const fetch = vi
      .fn<CacheFetch>()
      .mockRejectedValueOnce(firstError)
      .mockRejectedValue(laterError);
    const cache = new DatafileCache(fetch, 100);
    const original = tagData(data(), 'provided');
    cache.seed(original);
    const policy = { assess: () => ({ status: 'expired' as const }) };
    cache.fail(firstError);
    expect(await cache.resolve(policy)).toEqual([original, 'STALE']);
    vi.setSystemTime(1_100);
    cache.fail(laterError);
    expect(await cache.resolve(policy)).toEqual([original, 'STALE']);
    vi.setSystemTime(1_101);
    await expect(cache.resolve(policy)).rejects.toBe(firstError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records a rejected cache fetch as source failure', async () => {
    const failure = new Error('retired source');
    const fetch = vi.fn().mockRejectedValue(failure);
    const cache = new DatafileCache(fetch, 0);
    const original = tagData(data(), 'provided');
    cache.seed(original);
    await expect(
      cache.resolve({ assess: () => ({ status: 'expired' as const }) }),
    ).rejects.toBe(failure);
    expect(() => cache.read()).toThrow(failure);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps background fetching handled when waitUntil registration throws', async () => {
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>(() => {
      throw new Error('registration failed');
    });
    const failure = new Error('fetch failed');
    const fetch = vi.fn().mockRejectedValue(failure);
    const cache = new DatafileCache(fetch, 0, waitUntil);
    const original = tagData(data(), 'provided');
    cache.seed(original);
    expect(
      await cache.resolve({ assess: () => ({ status: 'stale' as const }) }),
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
    const pending = deferred();
    const fetch = vi.fn(async () => {
      await pending.promise;
      return data(2);
    });
    const cache = new DatafileCache(fetch, Infinity, waitUntil);
    const original = tagData(data(), 'provided');
    cache.seed(original);
    const policy = { assess: () => ({ status: 'stale' as const }) };
    expect(await cache.resolve(policy)).toEqual([original, 'STALE']);
    expect(waitUntil).toHaveBeenCalledExactlyOnceWith(expect.any(Promise));
    const settled = vi.fn();
    const blocking = cache
      .resolve({ ...policy, assess: () => ({ status: 'expired' as const }) })
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
    const failure = new Error('refresh failed');
    const fetch = vi.fn<CacheFetch>().mockRejectedValueOnce(failure);
    const cache = new DatafileCache(fetch, 0, waitUntil);
    cache.seed(tagData(data(), 'provided'));
    const policy = { assess: () => ({ status: 'stale' as const }) };

    expect((await cache.resolve(policy))?.[1]).toBe('STALE');
    await waitUntil.mock.calls[0]?.[0];
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Revalidation failed:',
      failure,
    );
    errorSpy.mockClear();
    expect(() => cache.read()).toThrow(failure);

    fetch.mockResolvedValueOnce(data(2));
    await expect(cache.resolve(policy)).rejects.toBe(failure);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it('contains synchronous fetch failures and permits a later retry', async () => {
    const failure = new Error('synchronous failure');
    const fetch = vi.fn<CacheFetch>(() => {
      throw failure;
    });
    const cache = new DatafileCache(fetch);
    const policy = { assess: () => ({ status: 'expired' as const }) };
    await expect(cache.resolve(policy)).rejects.toBe(failure);
    fetch.mockResolvedValueOnce(data());
    expect((await cache.resolve(policy))?.[1]).toBe('MISS');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('cancels queued fetch without invoking the callback', async () => {
    const fetch = vi.fn<CacheFetch>();
    const cache = new DatafileCache(fetch);
    const reading = cache.resolve({
      assess: () => ({ status: 'expired' as const }),
    });
    const outcome = expect(reading).rejects.toThrow();
    cache.clear();
    await outcome;
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not let cancelled work fail or clear a newer fetch', async () => {
    const oldPending = deferred();
    const nextPending = deferred();
    const fetch = vi
      .fn<CacheFetch>()
      .mockImplementationOnce(async () => {
        await oldPending.promise;
        return data(2);
      })
      .mockImplementationOnce(async (signal) => {
        await nextPending.promise;
        signal.throwIfAborted();
        return data(2);
      });
    const cache = new DatafileCache(fetch, 0);
    cache.seed(tagData(data(), 'provided'));
    const policy = { assess: () => ({ status: 'expired' as const }) };
    const oldRead = cache.resolve(policy);
    const cancelled = expect(oldRead).rejects.toThrow();
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

  function assessment(headerSource: HeaderSource, header: string | undefined) {
    vi.mocked(getRequestContext).mockReturnValue({
      ctx: undefined,
      headers:
        header === undefined
          ? undefined
          : { 'x-vercel-flags-config-versions': header },
    });
    return headerSource.getAssessment();
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
    expect(assessment(headerSource, header)({ ...data(), ageMs: 0 })).toEqual({
      status: 'unknown',
    });
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
    expect(
      assessment(
        headerSource,
        'flags_prj_policy=2',
      )({
        ...data(),
        configUpdatedAt,
        ageMs: 0,
      }),
    ).toEqual({ status: 'unknown' });
  });

  it.each([
    [1, 2, Infinity, 1, 'fresh'],
    [2, 2, Infinity, 1, 'fresh'],
    [3, 2, 0, 1, 'stale'],
    [3, 2, 1_000, 1, 'stale'],
    [3, 2, 1_001, 1, 'expired'],
    [3, 2, Infinity, 1, 'expired'],
    [3, 2, 0, 0, 'expired'],
    [3, 2, 500, 0.5, 'stale'],
    [3, 2, 501, 0.5, 'expired'],
  ])('assesses header %s against timestamp %s with age %s and SWR %s as %s', (headerTs, currentTs, ageMs, swr, status) => {
    const headerSource = source(swr);
    const metadata = { ...data(currentTs), ageMs };
    expect(
      assessment(
        headerSource,
        `flags_other=99; flags_prj_policy=${headerTs}`,
      )(metadata),
    ).toEqual({
      status,
      ...(status === 'fresh' ? { confirmed: headerTs === currentTs } : {}),
    });
  });

  it('resets cache age on an equal highest-observed header, then blocks older confirmations until stop', async () => {
    const cache = new DatafileCache(neverSettlingFetch, 0);
    const original = Object.freeze(
      tagData({ ...data(), fetchedAt: 500 }, 'bundled'),
    );
    cache.seed(original);
    const headerSource = source();
    const matching = assessment(headerSource, 'flags_prj_policy=1');
    const initialFailure = new Error('initial outage');
    cache.fail(initialFailure);
    expect(matching(cache.metadata!)).toEqual({
      status: 'fresh',
      confirmed: true,
    });
    // Assessing the header returns evidence; only the cache applies recovery.
    expect(cache.ageMs).toBe(500);
    expect(() => cache.read()).toThrow(initialFailure);
    expect(
      await cache.resolve({
        assess: matching,
      }),
    ).toEqual([original, 'HIT']);
    expect(cache.ageMs).toBe(0);
    expect(original.fetchedAt).toBe(500);
    expect(original._origin).toBe('bundled');

    vi.setSystemTime(1_100);
    expect(
      await cache.resolve({
        assess: assessment(headerSource, 'flags_prj_policy=2'),
      }),
    ).toEqual([original, 'STALE']);
    const error = new Error('outage');
    cache.fail(error);
    await expect(
      cache.resolve({
        assess: assessment(headerSource, 'flags_prj_policy=1'),
      }),
    ).rejects.toBe(error);
    expect(cache.ageMs).toBe(100);

    headerSource.stop();
    expect(
      await cache.resolve({
        assess: assessment(headerSource, 'flags_prj_policy=1'),
      }),
    ).toEqual([original, 'HIT']);
    expect(cache.ageMs).toBe(0);
    expect(original.fetchedAt).toBe(500);
  });

  it('assesses the captured raw header after a shared cold fetch discovers the project', async () => {
    const headerSource = source();
    const headers = { 'x-vercel-flags-config-versions': 'flags_prj_policy=2' };
    vi.mocked(getRequestContext).mockReturnValue({ ctx: undefined, headers });
    const originalCheck = vi.fn(headerSource.getAssessment());
    const pending = deferred();
    const fetch = vi.fn(async () => {
      await pending.promise;
      return data();
    });
    const cache = new DatafileCache(fetch, 0);
    const firstRead = cache.resolve({ assess: originalCheck });
    headers['x-vercel-flags-config-versions'] = 'flags_prj_policy=1';
    const laterCheck = vi.fn(headerSource.getAssessment());
    const secondRead = cache.resolve({ assess: laterCheck });
    await vi.advanceTimersByTimeAsync(0);
    expect(originalCheck).not.toHaveBeenCalled();
    expect(laterCheck).not.toHaveBeenCalled();
    pending.resolve();
    expect(await Promise.all([firstRead, secondRead])).toEqual([
      [cache.read(), 'MISS'],
      [cache.read(), 'MISS'],
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(originalCheck).toHaveReturnedWith({ status: 'stale' });
    expect(laterCheck).toHaveReturnedWith({
      status: 'fresh',
      confirmed: false,
    });
    expect(originalCheck).toHaveBeenCalledTimes(1);
    expect(laterCheck).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_100);
    cache.fail(new Error('outage'));
    await expect(cache.resolve({ assess: laterCheck })).rejects.toThrow(
      'outage',
    );
    expect(cache.ageMs).toBe(100);
  });

  it('accepts the fallback header and gives the Vercel header precedence', () => {
    const headerSource = source();
    vi.mocked(getRequestContext).mockReturnValue({
      ctx: undefined,
      headers: { 'flags-config-versions': 'flags_prj_policy=1' },
    });
    expect(
      headerSource.getAssessment()({ ...data(), ageMs: Infinity }),
    ).toEqual({ status: 'fresh', confirmed: true });
    vi.mocked(getRequestContext).mockReturnValue({
      ctx: undefined,
      headers: {
        'x-vercel-flags-config-versions': 'flags_prj_policy=2',
        'flags-config-versions': 'flags_prj_policy=1',
      },
    });
    expect(
      headerSource.getAssessment()({ ...data(), ageMs: Infinity }),
    ).toEqual({ status: 'expired' });
  });

  it('accepts fetched data directly and confirms equal responses without changing fetchedAt', async () => {
    const cache = new DatafileCache(
      (signal) =>
        fetchDatafile({
          ...normalizeOptions({
            auth: new Authentication(undefined),
            vercel: true,
          }),
          signal,
        }),
      Infinity,
    );
    const original = Object.freeze(
      tagData({ ...data(), fetchedAt: 500 }, 'bundled'),
    );
    cache.seed(original);
    const headerSource = source();
    const incoming = Object.freeze({
      ...data(),
      configUpdatedAt: 1,
      revision: 1,
      digest: 'test',
    });
    vi.mocked(fetchDatafile).mockResolvedValue(incoming);
    vi.setSystemTime(2_000);
    expect(
      await cache.resolve({ assess: () => ({ status: 'expired' }) }),
    ).toEqual([original, 'MISS']);
    expect(fetchDatafile).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(cache.read()).toBe(original);
    expect(cache.ageMs).toBe(0);
    expect(original.fetchedAt).toBe(500);
    expect(original._origin).toBe('bundled');
    expect(incoming).not.toHaveProperty('_origin');
    expect(incoming).not.toHaveProperty('fetchedAt');
    expect(
      await cache.resolve({
        assess: assessment(headerSource, 'flags_prj_policy=2'),
      }),
    ).toEqual([original, 'STALE']);
  });

  it('suppresses a successful transport response after cache clear cancels the fetch', async () => {
    const headerSource = source();
    const pending = deferred();
    vi.mocked(fetchDatafile).mockImplementation(async () => {
      await pending.promise;
      return { ...data(2), configUpdatedAt: 2, revision: 2, digest: 'test' };
    });
    const cache = new DatafileCache(
      (signal) =>
        fetchDatafile({
          ...normalizeOptions({
            auth: new Authentication(undefined),
            vercel: true,
          }),
          signal,
        }),
      0,
    );
    const reading = cache.resolve({
      assess: assessment(headerSource, 'flags_prj_policy=2'),
    });
    const outcome = expect(reading).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchDatafile).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(fetchDatafile).mock.calls[0]?.[0].signal;
    cache.clear();
    pending.resolve();
    await outcome;
    expect(signal?.aborted).toBe(true);
    expect(cache.read()).toBeUndefined();
    expect(cache.ageMs).toBe(Infinity);
    const replacement = tagData(data(), 'provided');
    cache.seed(replacement);
    expect(cache.read()).toBe(replacement);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatafileCache } from './datafile-cache';
import type { TaggedData } from './tagged-data';

function data(_origin: TaggedData['_origin'] = 'provided'): TaggedData {
  return {
    _origin,
    definitions: {},
    segments: {},
    projectId: 'prj_test',
    environment: 'production',
    configUpdatedAt: 1,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});
afterEach(() => vi.useRealTimers());

describe('cache assessment contract for future refresh sources', () => {
  it('requires a blocking fetch for an empty cache regardless of assessment', () => {
    const cache = new DatafileCache();
    expect(
      cache.read({
        snapshot: cache.peek(),
        needsRefresh: false,
        confirmedAt: Date.now(),
      }),
    ).toEqual({ refresh: 'blocking' });
  });

  it('preserves cached-read behavior when the source has no invalidation', () => {
    const cache = new DatafileCache();
    const original = cache.set(data());
    expect(cache.read({ snapshot: cache.peek(), needsRefresh: false })).toEqual(
      { data: original, refresh: 'none' },
    );
    expect(cache.peek()?.fetchedAt).toBeUndefined();
  });

  it('uses the later of network fetch and matching confirmation, including the deadline', () => {
    const cache = new DatafileCache();
    const original = cache.set(data('poll'));
    const snapshot = cache.peek();
    const options = { staleWhileRevalidateMs: 100 };
    const earlier = { snapshot, needsRefresh: true, confirmedAt: 900 };
    vi.setSystemTime(1_100);
    expect(cache.read(earlier, options)).toEqual({
      data: original,
      refresh: 'background',
    });
    vi.setSystemTime(1_101);
    expect(cache.read(earlier, options)).toEqual({ refresh: 'blocking' });
    const later = { snapshot, needsRefresh: true, confirmedAt: 1_050 };
    vi.setSystemTime(1_150);
    expect(cache.read(later, options)).toEqual({
      data: original,
      refresh: 'background',
    });
    vi.setSystemTime(1_151);
    expect(cache.read(later, options)).toEqual({ refresh: 'blocking' });
    expect(original).not.toHaveProperty('fetchedAt');
  });

  it('does not renew freshness just because refresh is requested again', () => {
    const cache = new DatafileCache();
    cache.set(data());
    const assessment = {
      snapshot: cache.peek(),
      needsRefresh: true,
      confirmedAt: 1_000,
    };
    expect(
      cache.read(assessment, { staleWhileRevalidateMs: 100 }).refresh,
    ).toBe('background');
    vi.setSystemTime(1_101);
    expect(cache.read(assessment, { staleWhileRevalidateMs: 100 })).toEqual({
      refresh: 'blocking',
    });
  });

  it('blocks unknown-age seeds when invalidated and honors a zero refresh window', () => {
    const cache = new DatafileCache();
    cache.set(data());
    const assessment = { snapshot: cache.peek(), needsRefresh: true };
    expect(cache.read(assessment, { staleWhileRevalidateMs: 100 })).toEqual({
      refresh: 'blocking',
    });
    expect(
      cache.read(
        { ...assessment, confirmedAt: Date.now() },
        { staleWhileRevalidateMs: 0 },
      ),
    ).toEqual({ refresh: 'blocking' });
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('requires known freshness for invalidated %s seeds even with infinite SWR', (origin) => {
    const cache = new DatafileCache();
    const original = cache.set(data(origin));
    const assessment = { snapshot: cache.peek(), needsRefresh: true };
    const options = { staleWhileRevalidateMs: Infinity };

    expect(cache.read(assessment, options)).toEqual({ refresh: 'blocking' });
    expect(
      cache.read({ ...assessment, confirmedAt: Date.now() }, options),
    ).toEqual({ data: original, refresh: 'background' });
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('preserves unlimited error fallback for unknown-age %s seeds', (origin) => {
    const cache = new DatafileCache();
    const original = cache.set(data(origin));
    const assessment = { snapshot: cache.peek(), needsRefresh: true };
    const error = new Error('refresh failed');

    expect(cache.read(assessment, { error, staleIfErrorMs: Infinity })).toEqual(
      { data: original, refresh: 'background' },
    );
    expect(cache.read(assessment, { error })).toEqual({
      data: original,
      refresh: 'background',
    });
  });

  it.each([
    false,
    true,
  ])('ignores an old assessment after replacing an entry (same object=%s)', (reuse) => {
    const cache = new DatafileCache();
    const original = cache.set(data());
    const assessment = {
      snapshot: cache.peek(),
      needsRefresh: false,
      confirmedAt: Date.now(),
    };
    cache.set(reuse ? original : data());
    expect(cache.read(assessment, { staleWhileRevalidateMs: 100 })).toEqual({
      refresh: 'blocking',
    });
    const error = new Error('refresh failed');
    expect(() =>
      cache.read(
        { ...assessment, needsRefresh: true },
        { error, staleIfErrorMs: 100 },
      ),
    ).toThrow(error);
  });

  it('uses the same version-bound freshness for stale-if-error', () => {
    const cache = new DatafileCache();
    const original = cache.set(data());
    const assessment = {
      snapshot: cache.peek(),
      needsRefresh: true,
      confirmedAt: Date.now(),
    };
    const error = new Error('refresh failed');
    const options = { error, staleIfErrorMs: 100 };
    vi.setSystemTime(1_100);
    expect(cache.read(assessment, options)).toEqual({
      data: original,
      refresh: 'background',
    });
    vi.setSystemTime(1_101);
    expect(() => cache.read(assessment, options)).toThrow(error);
    expect(cache.peek()?.data).toBe(original);
  });
});

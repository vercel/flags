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
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('DatafileCache', () => {
  it('returns undefined when empty without fetching or confirming a failure', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Unexpected fetch');
    });
    const cache = new DatafileCache();
    expect(cache.peek()).toBeUndefined();
    expect(cache.read(Infinity)).toBeUndefined();

    const error = new Error('poll failed before data arrived');
    cache.fail(error);
    cache.confirm(cache.peek());
    expect(cache.read(0)).toBeUndefined();
    cache.set(data());
    expect(() => cache.read(0)).toThrow(error);
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stores data without an age-based expiry when no failure exists', () => {
    const cache = new DatafileCache();
    const original = data();
    expect(cache.set(original)).toBe(original);
    expect(cache.peek()).toEqual({ data: original });

    vi.setSystemTime(1_000_000);
    expect(cache.read(0)).toBe(original);
  });

  it('starts the inclusive allowance at the first failure, not storage time', () => {
    const cache = new DatafileCache();
    const original = cache.set(data('poll'));
    vi.setSystemTime(2_000);
    const firstError = new Error('first poll failed');
    cache.fail(firstError);
    expect(cache.read(100)).toBe(original);

    vi.setSystemTime(2_100);
    cache.fail(new Error('second poll failed'));
    expect(cache.read(100)).toBe(original);
    vi.setSystemTime(2_101);
    expect(() => cache.read(100)).toThrow(firstError);
    expect(cache.peek()?.data).toBe(original);
  });

  it('supports immediate failure and unlimited stale reads', () => {
    const cache = new DatafileCache();
    const original = cache.set(data());
    const error = new Error('poll failed');
    cache.fail(error);
    expect(() => cache.read(0)).toThrow(error);
    expect(() => cache.read(-1)).toThrow(error);

    vi.setSystemTime(1_000_000);
    expect(cache.read(Infinity)).toBe(original);
  });

  it('does not clear or renew failure when storing network data', () => {
    const cache = new DatafileCache();
    cache.set(data('poll'));
    const error = new Error('poll failed');
    cache.fail(error);
    vi.setSystemTime(1_050);
    const replacement = cache.set(data('poll'));
    expect(cache.read(100)).toBe(replacement);
    vi.setSystemTime(1_101);
    expect(() => cache.read(100)).toThrow(error);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('restores %s seeds only within the original failure deadline', (origin) => {
    const cache = new DatafileCache();
    const seed = cache.set(data(origin));
    const snapshot = cache.peek();
    const firstError = new Error('first poll failed');
    cache.fail(firstError);

    vi.setSystemTime(1_050);
    cache.clear();
    expect(cache.peek()).toBeUndefined();
    expect(cache.read(0)).toBeUndefined();
    cache.confirm(snapshot);
    cache.confirm(cache.peek());
    cache.fail(new Error('poll still failing'));
    cache.set(seed);
    expect(cache.read(100)).toBe(seed);
    vi.setSystemTime(1_100);
    expect(cache.read(100)).toBe(seed);

    vi.setSystemTime(1_101);
    cache.clear();
    cache.set(seed);
    cache.fail(new Error('poll failed again'));
    expect(() => cache.read(100)).toThrow(firstError);
  });

  it('clears failure on matching confirmation without replacing the entry', () => {
    const cache = new DatafileCache();
    const original = cache.set(data());
    const snapshot = cache.peek();
    const firstError = new Error('first outage');
    cache.fail(firstError);
    vi.setSystemTime(2_000);
    expect(() => cache.read(100)).toThrow(firstError);

    cache.confirm(snapshot);
    expect(cache.peek()).toBe(snapshot);
    expect(cache.read(0)).toBe(original);

    const nextError = new Error('next outage');
    cache.fail(nextError);
    vi.setSystemTime(2_100);
    expect(cache.read(100)).toBe(original);
    vi.setSystemTime(2_101);
    expect(() => cache.read(100)).toThrow(nextError);
  });

  it.each([
    false,
    true,
  ])('rejects old confirmation after replacement (same data object=%s)', (reuse) => {
    const cache = new DatafileCache();
    const original = cache.set(data());
    const oldSnapshot = cache.peek();
    cache.set(reuse ? original : data());
    const replacementSnapshot = cache.peek();
    expect(replacementSnapshot).not.toBe(oldSnapshot);
    const error = new Error('replacement outage');
    cache.fail(error);

    cache.confirm(oldSnapshot);
    cache.confirm(undefined);
    expect(() => cache.read(0)).toThrow(error);
    expect(cache.peek()).toBe(replacementSnapshot);
  });
});

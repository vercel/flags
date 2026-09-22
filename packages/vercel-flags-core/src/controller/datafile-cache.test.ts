import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatafileInput } from '../types';
import { DatafileCache } from './datafile-cache';
import type { TaggedData } from './tagged-data';

function response(overrides: Partial<DatafileInput> = {}): DatafileInput {
  return {
    definitions: {},
    segments: {},
    projectId: 'prj_test',
    environment: 'production',
    configUpdatedAt: 1,
    ...overrides,
  };
}

function data(_origin: TaggedData['_origin'] = 'provided'): TaggedData {
  return { ...response(), _origin };
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
    cache.confirm();
    expect(cache.tryConfirm(response())).toBe(false);
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
    expect(cache.peek()).toBe(original);

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
    expect(cache.peek()).toBe(original);
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
    const firstError = new Error('first poll failed');
    cache.fail(firstError);

    vi.setSystemTime(1_050);
    cache.clear();
    expect(cache.peek()).toBeUndefined();
    expect(cache.read(0)).toBeUndefined();
    expect(cache.tryConfirm(response())).toBe(false);
    cache.confirm();
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

  it('clears failure on a matching raw source response without replacing data', () => {
    const cache = new DatafileCache();
    const original = cache.set(data());
    const incoming = response();
    const firstError = new Error('first outage');
    cache.fail(firstError);
    vi.setSystemTime(2_000);
    expect(() => cache.read(100)).toThrow(firstError);

    expect(cache.tryConfirm(incoming)).toBe(true);
    expect(cache.peek()).toBe(original);
    expect(incoming).not.toHaveProperty('_origin');
    expect(cache.read(0)).toBe(original);

    const nextError = new Error('next outage');
    cache.fail(nextError);
    vi.setSystemTime(2_100);
    expect(cache.read(100)).toBe(original);
    vi.setSystemTime(2_101);
    expect(() => cache.read(100)).toThrow(nextError);
  });

  it.each([
    [1, 1],
    [1, '1'],
    ['1', 1],
    ['1', '1'],
    [0, '0'],
  ])('confirms equal finite versions (%s and %s)', (current, incoming) => {
    const cache = new DatafileCache();
    const original = cache.set({ ...data(), configUpdatedAt: current });
    cache.fail(new Error('poll failed'));

    expect(cache.tryConfirm(response({ configUpdatedAt: incoming }))).toBe(
      true,
    );
    expect(cache.peek()).toBe(original);
    expect(cache.read(0)).toBe(original);
  });

  it.each([
    ['wrong project', { projectId: 'prj_other' }],
    ['wrong environment', { environment: 'preview' }],
    ['older version', { configUpdatedAt: 0 }],
    ['newer version', { configUpdatedAt: 2 }],
    ['missing version', { configUpdatedAt: undefined }],
    ['invalid version', { configUpdatedAt: 'invalid' }],
    ['NaN version', { configUpdatedAt: NaN }],
    ['string NaN version', { configUpdatedAt: 'NaN' }],
    ['infinite version', { configUpdatedAt: Infinity }],
    ['string infinite version', { configUpdatedAt: 'Infinity' }],
    ['negative infinite version', { configUpdatedAt: -Infinity }],
  ] satisfies [
    string,
    Partial<DatafileInput>,
  ][])('rejects %s without changing storage or the failure deadline', (_, overrides) => {
    const cache = new DatafileCache();
    const original = cache.set(data());
    const error = new Error('first outage');
    cache.fail(error);
    vi.setSystemTime(1_050);

    expect(cache.tryConfirm(response(overrides))).toBe(false);
    expect(cache.peek()).toBe(original);
    vi.setSystemTime(1_100);
    expect(cache.read(100)).toBe(original);
    vi.setSystemTime(1_101);
    expect(() => cache.read(100)).toThrow(error);
  });

  it.each([
    undefined,
    'invalid',
    NaN,
    'NaN',
    Infinity,
    'Infinity',
    -Infinity,
  ])('never confirms invalid current version %s, even for the same object', (configUpdatedAt) => {
    const cache = new DatafileCache();
    const original = cache.set({ ...data(), configUpdatedAt });
    const error = new Error('poll failed');
    cache.fail(error);

    expect(cache.tryConfirm(response())).toBe(false);
    expect(cache.tryConfirm(response({ configUpdatedAt }))).toBe(false);
    expect(cache.tryConfirm(original)).toBe(false);
    expect(() => cache.read(0)).toThrow(error);
    expect(cache.peek()).toBe(original);
  });

  it.each([
    undefined,
    'invalid',
    NaN,
    Infinity,
  ])('recovers explicitly after storing an accepted update with version %s', (configUpdatedAt) => {
    const cache = new DatafileCache();
    cache.set(data());
    const error = new Error('poll failed');
    cache.fail(error);
    const accepted = cache.set({ ...data('poll'), configUpdatedAt });
    expect(() => cache.read(0)).toThrow(error);

    cache.confirm();
    expect(cache.peek()).toBe(accepted);
    expect(cache.read(0)).toBe(accepted);
  });

  it('rejects an old response after storing a newer replacement', () => {
    const cache = new DatafileCache();
    cache.set(data());
    const oldResponse = response();
    const replacement = cache.set({ ...data('poll'), configUpdatedAt: 2 });
    const error = new Error('replacement outage');
    cache.fail(error);

    expect(cache.tryConfirm(oldResponse)).toBe(false);
    expect(() => cache.read(0)).toThrow(error);
    expect(cache.peek()).toBe(replacement);
  });
});

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

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
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

describe('DatafileCache', () => {
  it.each([
    0,
    100,
    Infinity,
  ])('returns undefined when empty with policy %s without fetching or confirming a failure', (staleIfErrorMs) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Unexpected fetch');
    });
    const cache = new DatafileCache(staleIfErrorMs);
    expect(cache.hasData).toBe(false);
    expect(cache.revision).toBeUndefined();
    expect(cache.read()).toBeUndefined();

    const error = new Error('poll failed before data arrived');
    cache.fail(error);
    expect(cache.tryConfirm(response())).toBe(false);
    expect(cache.tryConfirm(response({ revision: 1 }), 'revision')).toBe(false);
    vi.setSystemTime(1_101);
    expect(cache.read()).toBeUndefined();
    const original = data();
    cache.seed(original);
    expect(cache.hasData).toBe(true);
    if (staleIfErrorMs === Infinity) {
      expect(cache.read()).toBe(original);
    } else {
      expect(() => cache.read()).toThrow(error);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stores data without an age-based expiry when no failure exists', () => {
    const cache = new DatafileCache(0);
    const original = data();
    expect(cache.seed(original)).toBeUndefined();
    expect(cache.read()).toBe(original);

    vi.setSystemTime(1_000_000);
    expect(cache.read()).toBe(original);
  });

  it('starts the inclusive allowance at the first failure, not storage time', () => {
    const cache = new DatafileCache(100);
    const original = { ...data('poll'), revision: 42 };
    cache.seed(original);
    vi.setSystemTime(2_000);
    const firstError = new Error('first poll failed');
    cache.fail(firstError);
    expect(cache.read()).toBe(original);

    vi.setSystemTime(2_100);
    cache.fail(new Error('second poll failed'));
    expect(cache.read()).toBe(original);
    vi.setSystemTime(2_101);
    expect(() => cache.read()).toThrow(firstError);
    expect(cache.hasData).toBe(true);
    expect(cache.revision).toBe(42);
    expect(() => cache.read()).toThrow(firstError);
    cache.clear();
    expect(cache.hasData).toBe(false);
    expect(cache.revision).toBeUndefined();
    expect(cache.read()).toBeUndefined();
  });

  it.each([0, -1])('fails immediately with policy %s', (staleIfErrorMs) => {
    const cache = new DatafileCache(staleIfErrorMs);
    const original = data();
    cache.seed(original);
    expect(cache.read()).toBe(original);
    const error = new Error('poll failed');
    cache.fail(error);
    expect(() => cache.read()).toThrow(error);

    vi.setSystemTime(1_000_000);
    expect(() => cache.read()).toThrow(error);
  });

  it.each([
    undefined,
    Infinity,
  ])('allows unlimited stale reads with policy %s', (staleIfErrorMs) => {
    const cache = new DatafileCache(staleIfErrorMs);
    const original = data();
    cache.seed(original);
    cache.fail(new Error('poll failed'));
    expect(cache.read()).toBe(original);

    vi.setSystemTime(1_000_000);
    cache.fail(new Error('poll still failing'));
    expect(cache.read()).toBe(original);
  });

  it('does not clear or renew failure when seeding network data', () => {
    const cache = new DatafileCache(100);
    cache.seed(data('poll'));
    const error = new Error('poll failed');
    cache.fail(error);
    vi.setSystemTime(1_050);
    const replacement = data('poll');
    cache.seed(replacement);
    expect(cache.read()).toBe(replacement);
    vi.setSystemTime(1_101);
    expect(() => cache.read()).toThrow(error);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('restores %s seeds only within the original failure deadline', (origin) => {
    const cache = new DatafileCache(100);
    const seed = data(origin);
    cache.seed(seed);
    const firstError = new Error('first poll failed');
    cache.fail(firstError);

    vi.setSystemTime(1_050);
    cache.clear();
    expect(cache.hasData).toBe(false);
    expect(cache.read()).toBeUndefined();
    expect(cache.tryConfirm(response())).toBe(false);
    cache.fail(new Error('poll still failing'));
    cache.seed(seed);
    expect(cache.read()).toBe(seed);
    vi.setSystemTime(1_100);
    expect(cache.read()).toBe(seed);

    vi.setSystemTime(1_101);
    cache.clear();
    cache.seed(seed);
    cache.fail(new Error('poll failed again'));
    expect(() => cache.read()).toThrow(firstError);
  });

  it('clears failure on a matching raw source response without replacing data', () => {
    const cache = new DatafileCache(100);
    const original = data();
    cache.seed(original);
    const incoming = response();
    const firstError = new Error('first outage');
    cache.fail(firstError);
    vi.setSystemTime(2_000);
    expect(() => cache.read()).toThrow(firstError);

    expect(cache.tryConfirm(incoming)).toBe(true);
    expect(incoming).not.toHaveProperty('_origin');
    expect(cache.read()).toBe(original);

    const nextError = new Error('next outage');
    cache.fail(nextError);
    vi.setSystemTime(2_100);
    expect(cache.read()).toBe(original);
    vi.setSystemTime(2_101);
    expect(() => cache.read()).toThrow(nextError);
  });

  it.each([
    [1, 1],
    [1, '1'],
    ['1', 1],
    ['1', '1'],
    [0, '0'],
  ])('confirms equal finite versions (%s and %s)', (current, incoming) => {
    const cache = new DatafileCache(0);
    const original = { ...data(), configUpdatedAt: current };
    cache.seed(original);
    const error = new Error('poll failed');
    cache.fail(error);
    expect(() => cache.read()).toThrow(error);

    expect(cache.tryConfirm(response({ configUpdatedAt: incoming }))).toBe(
      true,
    );
    expect(cache.read()).toBe(original);
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
    const cache = new DatafileCache(100);
    const original = data();
    cache.seed(original);
    const error = new Error('first outage');
    cache.fail(error);
    vi.setSystemTime(1_050);

    expect(cache.tryConfirm(response(overrides))).toBe(false);
    expect(cache.read()).toBe(original);
    vi.setSystemTime(1_100);
    expect(cache.read()).toBe(original);
    vi.setSystemTime(1_101);
    expect(() => cache.read()).toThrow(error);
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
    const cache = new DatafileCache(100);
    const original = { ...data(), configUpdatedAt };
    cache.seed(original);
    const error = new Error('poll failed');
    cache.fail(error);

    expect(cache.tryConfirm(response())).toBe(false);
    expect(cache.tryConfirm(response({ configUpdatedAt }))).toBe(false);
    expect(cache.tryConfirm(original)).toBe(false);
    expect(cache.read()).toBe(original);
    vi.setSystemTime(1_101);
    expect(() => cache.read()).toThrow(error);
  });

  describe.each([
    0, 100,
  ])('seed replacements with policy %s', (staleIfErrorMs) => {
    it.each([
      undefined,
      'invalid',
      NaN,
      Infinity,
    ])('retains failure when seeding a replacement with version %s', (configUpdatedAt) => {
      const cache = new DatafileCache(staleIfErrorMs);
      cache.seed(data());
      const error = new Error('poll failed');
      cache.fail(error);
      vi.setSystemTime(1_050);
      const replacement = { ...data('poll'), configUpdatedAt };
      cache.seed(replacement);
      if (staleIfErrorMs === 0) {
        expect(() => cache.read()).toThrow(error);
      } else {
        expect(cache.read()).toBe(replacement);
      }
      vi.setSystemTime(1_100);
      if (staleIfErrorMs === 0) {
        expect(() => cache.read()).toThrow(error);
      } else {
        expect(cache.read()).toBe(replacement);
      }
      vi.setSystemTime(1_101);
      expect(() => cache.read()).toThrow(error);
    });
  });

  it('rejects an old response after storing a newer replacement', () => {
    const cache = new DatafileCache(100);
    cache.seed(data());
    const oldResponse = response();
    const replacement = { ...data('poll'), configUpdatedAt: 2 };
    cache.seed(replacement);
    const error = new Error('replacement outage');
    cache.fail(error);

    expect(cache.tryConfirm(oldResponse)).toBe(false);
    expect(cache.read()).toBe(replacement);
    vi.setSystemTime(1_101);
    expect(() => cache.read()).toThrow(error);
  });

  describe('revision confirmation', () => {
    it.each([
      0, 42,
    ])('confirms revision %s after expiry without replacing data and starts a fresh allowance', (revision) => {
      const cache = new DatafileCache(100);
      const original = Object.freeze({ ...data('bundled'), revision });
      cache.seed(original);
      expect(cache.read()).toBe(original);
      const incoming = Object.freeze({
        revision,
        projectId: 'prj_test',
        environment: 'production',
      });
      const firstError = new Error('first outage');
      cache.fail(firstError);
      vi.setSystemTime(2_000);
      expect(() => cache.read()).toThrow(firstError);
      expect(cache.hasData).toBe(true);
      expect(cache.revision).toBe(revision);

      expect(cache.tryConfirm(incoming)).toBe(false);
      expect(() => cache.read()).toThrow(firstError);
      expect(cache.tryConfirm(incoming, 'revision')).toBe(true);
      expect(cache.read()).toBe(original);
      expect(original._origin).toBe('bundled');
      expect(incoming).toEqual({
        revision,
        projectId: 'prj_test',
        environment: 'production',
      });

      const nextError = new Error('second outage');
      cache.fail(nextError);
      vi.setSystemTime(2_100);
      expect(cache.read()).toBe(original);
      vi.setSystemTime(2_101);
      expect(() => cache.read()).toThrow(nextError);
      expect(cache.revision).toBe(revision);
    });

    it.each([
      ['wrong project', { projectId: 'prj_other' }],
      ['wrong environment', { environment: 'preview' }],
      ['older revision', { revision: 41 }],
      ['newer revision', { revision: 43 }],
      ['missing revision', { revision: undefined }],
      ['string revision', { revision: '42' }],
      ['malformed revision', { revision: 'invalid' }],
      ['null revision', { revision: null }],
      ['NaN revision', { revision: NaN }],
      ['infinite revision', { revision: Infinity }],
      ['negative infinite revision', { revision: -Infinity }],
    ])('rejects %s without replacing data or changing the failure deadline', (_, overrides) => {
      const cache = new DatafileCache(100);
      const original = Object.freeze({ ...data('bundled'), revision: 42 });
      cache.seed(original);
      // Network payloads can contain malformed revisions despite the static type.
      const incoming = Object.freeze({
        configUpdatedAt: 1,
        revision: 42,
        projectId: 'prj_test',
        environment: 'production',
        ...overrides,
      }) as Parameters<DatafileCache['tryConfirm']>[0];
      const error = new Error('first outage');
      cache.fail(error);
      vi.setSystemTime(1_050);

      expect(cache.tryConfirm(incoming, 'revision')).toBe(false);
      expect(cache.read()).toBe(original);
      vi.setSystemTime(1_100);
      expect(cache.read()).toBe(original);
      vi.setSystemTime(1_101);
      expect(() => cache.read()).toThrow(error);
      expect(cache.revision).toBe(42);
      expect(cache.tryConfirm(incoming, 'revision')).toBe(false);
      expect(() => cache.read()).toThrow(error);

      expect(cache.tryConfirm(original, 'revision')).toBe(true);
      expect(cache.read()).toBe(original);
    });

    it.each([
      undefined,
      '42',
      'invalid',
      null,
      NaN,
      Infinity,
      -Infinity,
    ])('never confirms invalid stored revision %s, even for the same object', (revision) => {
      const cache = new DatafileCache(100);
      const original = Object.freeze({
        ...data('bundled'),
        revision,
      }) as TaggedData;
      cache.seed(original);
      const error = new Error('outage');
      cache.fail(error);
      vi.setSystemTime(1_050);

      expect(cache.tryConfirm({ ...original, revision: 42 }, 'revision')).toBe(
        false,
      );
      expect(cache.tryConfirm(original, 'revision')).toBe(false);
      expect(cache.read()).toBe(original);
      vi.setSystemTime(1_101);
      expect(cache.tryConfirm(original, 'revision')).toBe(false);
      expect(() => cache.read()).toThrow(error);
      expect(cache.hasData).toBe(true);
    });
  });

  describe('updateFromSource', () => {
    it.each([
      'poll',
      'stream',
    ] as const)('accepts the first %s response and clears a failure recorded while empty', (origin) => {
      const cache = new DatafileCache(0);
      cache.fail(new Error('failed before data arrived'));
      vi.setSystemTime(2_000);
      const incoming = response({ configUpdatedAt: NaN });
      const snapshot = { ...incoming };

      expect(cache.updateFromSource(incoming, origin)).toBeUndefined();
      expect(cache.read()).not.toBe(incoming);
      expect(cache.read()).toEqual({
        ...snapshot,
        _origin: origin,
        fetchedAt: 2_000,
      });
      expect(incoming).toEqual(snapshot);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
      [1, 2],
      [1, '2'],
      ['1', 2],
      ['9', '10'],
      [1, undefined],
      [1, 'invalid'],
      [1, 'NaN'],
      [1, Infinity],
      [1, 'Infinity'],
      [undefined, 0],
      ['invalid', 0],
      ['NaN', 0],
      [undefined, undefined],
      ['invalid', 'invalid'],
      [undefined, NaN],
      [NaN, undefined],
      [NaN, 'invalid'],
      [-Infinity, 0],
      [Infinity, undefined],
    ])('accepts version %s → %s and automatically starts a fresh allowance on the next failure', (current, next) => {
      const cache = new DatafileCache(100);
      cache.seed({ ...data('bundled'), configUpdatedAt: current });
      const firstError = new Error('first outage');
      cache.fail(firstError);
      vi.setSystemTime(2_000);
      expect(() => cache.read()).toThrow(firstError);
      const incoming = response({ configUpdatedAt: next });
      const snapshot = { ...incoming };

      expect(cache.updateFromSource(incoming, 'poll')).toBeUndefined();
      const accepted = cache.read();
      expect(accepted).not.toBe(incoming);
      expect(accepted).toEqual({
        ...snapshot,
        _origin: 'poll',
        fetchedAt: 2_000,
      });
      expect(incoming).toEqual(snapshot);
      expect(cache.read()?.definitions).toBe(incoming.definitions);

      const nextError = new Error('second outage');
      cache.fail(nextError);
      vi.setSystemTime(2_100);
      expect(cache.read()).toBe(accepted);
      vi.setSystemTime(2_101);
      expect(() => cache.read()).toThrow(nextError);
    });

    it.each([
      { projectId: 'prj_other' },
      { environment: 'preview' },
    ])('preserves acceptance of a newer version despite mismatched identity %j', (overrides) => {
      const cache = new DatafileCache(0);
      cache.seed(data('bundled'));
      cache.fail(new Error('outage'));
      const incoming = response({ ...overrides, configUpdatedAt: 2 });

      cache.updateFromSource(incoming, 'stream');
      expect(cache.read()).not.toBe(incoming);
      expect(cache.read()).toEqual({
        ...incoming,
        _origin: 'stream',
        fetchedAt: 1_000,
      });
      expect(incoming).toEqual(response({ ...overrides, configUpdatedAt: 2 }));
    });

    it.each([
      [1, 1],
      [1, '1'],
      ['1', 1],
      ['1', '1'],
      [0, '0'],
      ['0', 0],
    ])('confirms equal finite versions %s and %s without tagging or replacing either object', (current, next) => {
      const cache = new DatafileCache(100);
      const original = Object.freeze({
        ...data('bundled'),
        configUpdatedAt: current,
      });
      cache.seed(original);
      const incoming = Object.freeze(response({ configUpdatedAt: next }));
      const snapshot = { ...incoming };
      const error = new Error('outage');
      cache.fail(error);
      vi.setSystemTime(1_101);
      expect(() => cache.read()).toThrow(error);

      expect(cache.updateFromSource(incoming, 'poll')).toBeUndefined();
      expect(cache.read()).toBe(original);
      expect(original._origin).toBe('bundled');
      expect(incoming).toEqual(snapshot);
      expect(incoming).not.toHaveProperty('_origin');
    });

    it.each([
      'reused',
      'distinct',
    ])('confirms a %s tagged response without changing its origin', (kind) => {
      const cache = new DatafileCache(0);
      const original = Object.freeze(data('bundled'));
      cache.seed(original);
      const incoming =
        kind === 'reused' ? original : Object.freeze(data('provided'));
      const snapshot = { ...incoming };
      cache.fail(new Error('outage'));

      cache.updateFromSource(incoming, 'poll');
      expect(cache.read()).toBe(original);
      expect(original._origin).toBe('bundled');
      expect(incoming).toEqual(snapshot);
    });

    describe.each([
      0, 100,
    ])('rejected responses with policy %s', (staleIfErrorMs) => {
      it.each([
        ['older version', { configUpdatedAt: 0 }],
        ['older numeric string', { configUpdatedAt: '0' }],
        ['wrong project', { projectId: 'prj_other' }],
        ['wrong environment', { environment: 'preview' }],
        ['numeric NaN', { configUpdatedAt: NaN }],
        ['negative Infinity', { configUpdatedAt: -Infinity }],
        ['string negative Infinity', { configUpdatedAt: '-Infinity' }],
      ] satisfies [
        string,
        Partial<DatafileInput>,
      ][])('rejects %s without mutation or clearing the original error/deadline', (_, overrides) => {
        const cache = new DatafileCache(staleIfErrorMs);
        const original = Object.freeze(data('bundled'));
        cache.seed(original);
        expect(cache.read()).toBe(original);
        const incoming = Object.freeze(response(overrides));
        const snapshot = { ...incoming };
        const error = new Error('first outage');
        cache.fail(error);
        vi.setSystemTime(1_050);

        expect(cache.updateFromSource(incoming, 'poll')).toBeUndefined();
        if (staleIfErrorMs === 0) {
          expect(() => cache.read()).toThrow(error);
        } else {
          expect(cache.read()).toBe(original);
        }
        expect(original._origin).toBe('bundled');
        expect(incoming).toEqual(snapshot);
        expect(incoming).not.toHaveProperty('_origin');
        cache.fail(new Error('repeated outage'));
        vi.setSystemTime(1_100);
        if (staleIfErrorMs === 0) {
          expect(() => cache.read()).toThrow(error);
        } else {
          expect(cache.read()).toBe(original);
        }
        vi.setSystemTime(1_101);
        expect(() => cache.read()).toThrow(error);
        expect(cache.tryConfirm(original)).toBe(true);
        expect(cache.read()).toBe(original);
      });

      it.each([
        [NaN, 1],
        [NaN, NaN],
        [Infinity, 1],
        [Infinity, Infinity],
        [Infinity, 'Infinity'],
        ['Infinity', Infinity],
        [-Infinity, -Infinity],
        [-Infinity, '-Infinity'],
      ])('cannot recover from a rejected response with nonfinite current version %s and incoming version %s', (current, next) => {
        const cache = new DatafileCache(staleIfErrorMs);
        const original = Object.freeze({
          ...data('bundled'),
          configUpdatedAt: current,
        });
        cache.seed(original);
        expect(cache.read()).toBe(original);
        const incoming = Object.freeze(response({ configUpdatedAt: next }));
        const snapshot = { ...incoming };
        const error = new Error('first outage');
        cache.fail(error);
        vi.setSystemTime(1_050);

        cache.updateFromSource(incoming, 'poll');
        cache.updateFromSource(original, 'poll');
        if (staleIfErrorMs === 0) {
          expect(() => cache.read()).toThrow(error);
        } else {
          expect(cache.read()).toBe(original);
        }
        expect(original._origin).toBe('bundled');
        expect(incoming).toEqual(snapshot);
        expect(incoming).not.toHaveProperty('_origin');
        vi.setSystemTime(1_100);
        if (staleIfErrorMs === 0) {
          expect(() => cache.read()).toThrow(error);
        } else {
          expect(cache.read()).toBe(original);
        }
        vi.setSystemTime(1_101);
        expect(() => cache.read()).toThrow(error);
      });

      it('rejects an old response after an accepted replacement without renewing its failure deadline', () => {
        const cache = new DatafileCache(staleIfErrorMs);
        const oldResponse = Object.freeze(data('bundled'));
        cache.seed(oldResponse);
        const replacement = response({ configUpdatedAt: 2 });
        cache.updateFromSource(replacement, 'poll');
        const accepted = cache.read();
        expect(accepted).not.toBe(replacement);
        expect(accepted).toEqual({
          ...replacement,
          _origin: 'poll',
          fetchedAt: 1_000,
        });
        const error = new Error('replacement outage');
        cache.fail(error);
        vi.setSystemTime(1_050);

        cache.updateFromSource(oldResponse, 'stream');
        if (staleIfErrorMs === 0) {
          expect(() => cache.read()).toThrow(error);
        } else {
          expect(cache.read()).toBe(accepted);
        }
        expect(oldResponse._origin).toBe('bundled');
        vi.setSystemTime(1_100);
        if (staleIfErrorMs === 0) {
          expect(() => cache.read()).toThrow(error);
        } else {
          expect(cache.read()).toBe(accepted);
        }
        vi.setSystemTime(1_101);
        expect(() => cache.read()).toThrow(error);
        expect(cache.tryConfirm(replacement)).toBe(true);
        expect(cache.read()).toBe(accepted);
      });
    });
  });
});

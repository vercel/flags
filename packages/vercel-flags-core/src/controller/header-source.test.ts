import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BundledDefinitions, DatafileInput } from '../types';
import { getRequestContext } from '../utils/request-context';
import type { Auth } from './auth';
import { fetchDatafile } from './fetch-datafile';
import { HeaderSource } from './header-source';
import { Controller } from './index';
import { normalizeOptions } from './normalized-options';
import { tagData } from './tagged-data';

vi.mock('../utils/request-context', () => ({ getRequestContext: vi.fn() }));
vi.mock('./fetch-datafile', () => ({ fetchDatafile: vi.fn() }));

const PROJECT_ID = 'prj_test';
const CURRENT_TIMESTAMP = 1_700_000_000_000;
const HEADER = 'x-vercel-flags-config-versions';
const auth: Auth = {
  resolveToken: async () => 'vf_test',
  resolveBundledDefinitionsLookup: async () => ({
    type: 'project-id',
    projectId: PROJECT_ID,
  }),
};

function datafile(configUpdatedAt = CURRENT_TIMESTAMP): BundledDefinitions {
  return {
    projectId: PROJECT_ID,
    environment: 'production',
    definitions: {},
    configUpdatedAt,
    digest: `digest-${configUpdatedAt}`,
    revision: configUpdatedAt - CURRENT_TIMESTAMP + 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

// Drain promise continuations, without sleeps, polling, or wall-clock timestamps.
function settlePromises() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function setHeader(value: string | undefined) {
  vi.mocked(getRequestContext).mockReturnValue({
    ctx: {},
    headers: value === undefined ? undefined : { [HEADER]: value },
  });
}

function setVersion(timestamp: number) {
  setHeader(`flags_${PROJECT_ID}=${timestamp}`);
}

let source: HeaderSource;
let onData: ReturnType<typeof vi.fn<(data: DatafileInput) => void>>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(CURRENT_TIMESTAMP);
  setVersion(CURRENT_TIMESTAMP);
  vi.mocked(fetchDatafile).mockResolvedValue(
    datafile(CURRENT_TIMESTAMP + 20_000),
  );
  source = new HeaderSource(
    normalizeOptions({
      auth,
      // Even an accidental call through to real fetchDatafile cannot use the network.
      fetch: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('Unexpected fetch')),
      buildStep: false,
    }),
  );
  onData = vi.fn<(data: DatafileInput) => void>();
  source.on('data', onData);
});

afterEach(() => {
  source.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HeaderSource', () => {
  it('strips freshness metadata from controller read and getDatafile views', async () => {
    setVersion(CURRENT_TIMESTAMP + 20_000);
    const controller = new Controller({
      auth,
      datafile: datafile(),
      buildStep: false,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response()),
    });
    try {
      for (const view of [
        await controller.read(),
        await controller.getDatafile(),
      ]) {
        expect(view).toStrictEqual({
          ...datafile(CURRENT_TIMESTAMP + 20_000),
          metrics: expect.any(Object),
        });
      }
      expect(fetchDatafile).toHaveBeenCalledTimes(1);
    } finally {
      await controller.shutdown();
    }
  });

  describe('header names', () => {
    it.each([
      HEADER,
      'flags-config-versions',
    ])('reads %s', async (headerName) => {
      vi.mocked(getRequestContext).mockReturnValue({
        ctx: {},
        headers: { [headerName]: `flags_${PROJECT_ID}=${CURRENT_TIMESTAMP}` },
      });
      const current = tagData(datafile(), 'provided');

      expect(source.isAvailable(PROJECT_ID)).toBe(true);
      await expect(source.read(current)).resolves.toEqual([current, 'HIT']);
      expect(fetchDatafile).not.toHaveBeenCalled();
    });

    it('prefers the x-vercel header when both names are present', async () => {
      vi.mocked(getRequestContext).mockReturnValue({
        ctx: {},
        headers: {
          [HEADER]: `flags_${PROJECT_ID}=${CURRENT_TIMESTAMP}`,
          'flags-config-versions': `flags_${PROJECT_ID}=${CURRENT_TIMESTAMP + 20_000}`,
        },
      });
      const current = tagData(datafile(), 'provided');

      await expect(source.read(current)).resolves.toEqual([current, 'HIT']);
      expect(fetchDatafile).not.toHaveBeenCalled();
    });

    it.each([
      'x-vercel-edge-config-versions',
      'edge-config-versions',
      'x-vercel-flags-config-version',
      'flags-config-version',
    ])('ignores the obsolete header %s', async (headerName) => {
      vi.mocked(getRequestContext).mockReturnValue({
        ctx: {},
        headers: {
          [headerName]: `flags_${PROJECT_ID}=${CURRENT_TIMESTAMP + 20_000}`,
        },
      });

      expect(source.isAvailable(PROJECT_ID)).toBe(false);
      await expect(
        source.read(tagData(datafile(), 'provided')),
      ).resolves.toBeUndefined();
      expect(fetchDatafile).not.toHaveBeenCalled();
    });
  });

  describe('project-specific version header', () => {
    it.each([
      `flags_other=${CURRENT_TIMESTAMP + 20_000};flags_${PROJECT_ID}=${CURRENT_TIMESTAMP}`,
      `flags_${PROJECT_ID}=${CURRENT_TIMESTAMP};flags_other=${CURRENT_TIMESTAMP + 20_000}`,
      `flags_${PROJECT_ID}_suffix=${CURRENT_TIMESTAMP + 20_000};flags_${PROJECT_ID}=${CURRENT_TIMESTAMP}`,
    ])('selects the exact project from %s', async (header) => {
      setHeader(header);
      const current = tagData(datafile(), 'provided');

      expect(source.isAvailable(PROJECT_ID)).toBe(true);
      await expect(source.read(current)).resolves.toEqual([current, 'HIT']);
      expect(fetchDatafile).not.toHaveBeenCalled();
    });

    it.each([
      ['absent header', undefined],
      ['empty header', ''],
      ['another project', `flags_other=${CURRENT_TIMESTAMP}`],
      [
        'project prefix only',
        `flags_${PROJECT_ID}_suffix=${CURRENT_TIMESTAMP}`,
      ],
      ['missing equals sign', `flags_${PROJECT_ID}`],
      ['empty value', `flags_${PROJECT_ID}=`],
      ['whitespace value', `flags_${PROJECT_ID}= `],
      ['non-numeric value', `flags_${PROJECT_ID}=invalid`],
      [
        'numeric prefix with garbage',
        `flags_${PROJECT_ID}=${CURRENT_TIMESTAMP}ms`,
      ],
      ['NaN', `flags_${PROJECT_ID}=NaN`],
      ['infinite value', `flags_${PROJECT_ID}=Infinity`],
      ['overflowing value', `flags_${PROJECT_ID}=1e309`],
      ['negative timestamp', `flags_${PROJECT_ID}=-1`],
    ])('ignores %s', async (_label, header) => {
      setHeader(header);
      const result = await source.read(tagData(datafile(), 'provided'));

      expect.soft(source.isAvailable(PROJECT_ID)).toBe(false);
      expect.soft(result).toBeUndefined();
      expect.soft(fetchDatafile).not.toHaveBeenCalled();
      expect.soft(onData).not.toHaveBeenCalled();
    });
  });

  describe('last-seen version history', () => {
    it('reuses a version observation across data objects without tagging them', async () => {
      const original = Object.freeze(tagData(datafile(), 'provided'));
      await expect(source.read(original)).resolves.toEqual([original, 'HIT']);
      expect(original).not.toHaveProperty('_lastSeen');

      const replacement = Object.freeze(tagData(datafile(), 'provided'));
      setVersion(CURRENT_TIMESTAMP + 20_000);
      await expect(source.read(replacement)).resolves.toEqual([
        replacement,
        'STALE',
      ]);
      expect(replacement).not.toHaveProperty('_lastSeen');
      await settlePromises();
      expect(fetchDatafile).toHaveBeenCalledTimes(1);
    });

    it('remembers observed headers independently of the cached version', async () => {
      const newer = tagData(datafile(CURRENT_TIMESTAMP + 1), 'provided');
      await expect(source.read(newer)).resolves.toEqual([newer, 'HIT']);

      // The previous read observed CURRENT_TIMESTAMP, not the newer cached version.
      const previous = tagData(datafile(), 'provided');
      setVersion(CURRENT_TIMESTAMP + 2);
      await expect(source.read(previous)).resolves.toEqual([previous, 'STALE']);
      await settlePromises();

      const result = await source.read(newer);
      expect(result?.[1]).toBe('MISS');
      expect(fetchDatafile).toHaveBeenCalledTimes(2);
    });

    it('keeps ten versions in FIFO order even when a version is reobserved', async () => {
      // Reobserving the oldest version must not change its eviction order.
      for (const offset of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 10]) {
        const version = CURRENT_TIMESTAMP + offset;
        setVersion(version);
        await source.read(tagData(datafile(version), 'provided'));
      }

      const retained = tagData(datafile(CURRENT_TIMESTAMP + 1), 'provided');
      await expect(source.read(retained)).resolves.toEqual([retained, 'STALE']);
      await settlePromises();

      // The first inserted version was evicted despite being reobserved.
      const evicted = await source.read(tagData(datafile(), 'provided'));
      expect(evicted?.[1]).toBe('MISS');
      expect(fetchDatafile).toHaveBeenCalledTimes(2);
    });

    it('clears version history when stopped', async () => {
      await source.read(tagData(datafile(), 'provided'));
      source.stop();
      setVersion(CURRENT_TIMESTAMP + 1);

      const result = await source.read(tagData(datafile(), 'provided'));
      expect(result?.[1]).toBe('MISS');
      expect(fetchDatafile).toHaveBeenCalledTimes(1);
    });
  });

  describe('timestamp boundaries', () => {
    it.each([
      -1, 0,
    ])('returns HIT without fetching for delta %i ms', async (delta) => {
      setVersion(CURRENT_TIMESTAMP + delta);
      const current = tagData(datafile(), 'provided');

      const result = await source.read(current);

      expect(result).toEqual([current, 'HIT']);
      expect(result?.[0]).toBe(current);
      expect(fetchDatafile).not.toHaveBeenCalled();
      expect(onData).not.toHaveBeenCalled();
    });

    it.each([
      1, 9_999, 10_000,
    ])('returns STALE immediately and emits background data for delta %i ms', async (delta) => {
      setVersion(CURRENT_TIMESTAMP + delta);
      const current = tagData(datafile(), 'provided');
      setVersion(CURRENT_TIMESTAMP);
      await source.read(current);
      setVersion(CURRENT_TIMESTAMP + delta);

      const fresh = datafile(CURRENT_TIMESTAMP + delta);
      const pending = deferred<BundledDefinitions>();
      vi.mocked(fetchDatafile).mockReturnValueOnce(pending.promise);

      const result = await source.read(current);

      expect(result).toEqual([current, 'STALE']);
      expect(result?.[0]).toBe(current);
      expect(fetchDatafile).toHaveBeenCalledTimes(1);
      expect(onData).not.toHaveBeenCalled();
      pending.resolve(fresh);
      await settlePromises();
      expect(onData).toHaveBeenCalledExactlyOnceWith(fresh);
    });

    it.each([
      10_001, 20_000,
    ])('blocks and emits fetched data with MISS for delta %i ms', async (delta) => {
      setVersion(CURRENT_TIMESTAMP + delta);
      const fresh = datafile(CURRENT_TIMESTAMP + delta);
      const pending = deferred<BundledDefinitions>();
      vi.mocked(fetchDatafile).mockReturnValueOnce(pending.promise);
      const settled = vi.fn();
      const read = source.read(tagData(datafile(), 'provided'));
      void read.then(settled);
      await settlePromises();

      expect(settled).not.toHaveBeenCalled();
      expect(onData).not.toHaveBeenCalled();
      pending.resolve(fresh);
      await expect(read).resolves.toEqual([
        { ...fresh, _origin: 'fetched', _fetchedAt: CURRENT_TIMESTAMP },
        'MISS',
      ]);
      expect(fetchDatafile).toHaveBeenCalledTimes(1);
      expect(onData).toHaveBeenCalledExactlyOnceWith(fresh);
    });

    it('accepts legacy string timestamps in current data', async () => {
      const current = tagData(
        { ...datafile(), configUpdatedAt: String(CURRENT_TIMESTAMP) },
        'provided',
      );

      await expect(source.read(current)).resolves.toEqual([current, 'HIT']);
      expect(fetchDatafile).not.toHaveBeenCalled();
    });

    it('returns undefined without fetching when current data has no timestamp', async () => {
      setVersion(CURRENT_TIMESTAMP + 20_000);
      const current = tagData(
        { ...datafile(), configUpdatedAt: undefined },
        'provided',
      );

      await expect(source.read(current)).resolves.toBeUndefined();
      expect(fetchDatafile).not.toHaveBeenCalled();
      expect(onData).not.toHaveBeenCalled();
    });
  });

  it('timestamps fetched data on arrival without changing the previous datafile', async () => {
    const current = Object.freeze(tagData(datafile(), 'provided'));
    setVersion(CURRENT_TIMESTAMP + 20_000);
    const pending = deferred<BundledDefinitions>();
    vi.mocked(fetchDatafile).mockReturnValueOnce(pending.promise);
    const read = source.read(current);

    expect(current._fetchedAt).toBeUndefined();
    vi.setSystemTime(CURRENT_TIMESTAMP + 5_000);
    const fetched = datafile(CURRENT_TIMESTAMP + 20_000);
    pending.resolve(fetched);
    const result = await read;

    expect(result?.[0]).toBe(fetched);
    expect(result?.[0]._fetchedAt).toBe(CURRENT_TIMESTAMP + 5_000);
    expect(result?.[1]).toBe('MISS');
    expect(current._fetchedAt).toBeUndefined();
    expect(current.configUpdatedAt).toBe(CURRENT_TIMESTAMP);
    expect(fetchDatafile).toHaveBeenCalledTimes(1);
  });

  describe('fetch deduplication and subsequent reads', () => {
    it('shares one pending blocking fetch across concurrent readers', async () => {
      setVersion(CURRENT_TIMESTAMP + 20_000);
      const current = tagData(datafile(), 'provided');
      const pending = deferred<BundledDefinitions>();
      const fresh = datafile(CURRENT_TIMESTAMP + 20_000);
      vi.mocked(fetchDatafile).mockReturnValueOnce(pending.promise);

      const reads = [
        source.read(current),
        source.read(current),
        source.read(current),
      ];

      expect(fetchDatafile).toHaveBeenCalledTimes(1);
      pending.resolve(fresh);
      const results = await Promise.all(reads);
      for (const result of results) {
        expect(result).toEqual([
          { ...fresh, _origin: 'fetched', _fetchedAt: CURRENT_TIMESTAMP },
          'MISS',
        ]);
      }
      expect(onData).toHaveBeenCalledExactlyOnceWith(fresh);
    });

    it('shares background fetches even after the STALE read has settled', async () => {
      setVersion(CURRENT_TIMESTAMP + 1);
      const current = tagData(datafile(), 'provided');
      setVersion(CURRENT_TIMESTAMP);
      await source.read(current);
      setVersion(CURRENT_TIMESTAMP + 1);

      const pending = deferred<BundledDefinitions>();
      const fresh = datafile(CURRENT_TIMESTAMP + 1);
      vi.mocked(fetchDatafile).mockReturnValueOnce(pending.promise);

      const reads = await Promise.all([
        source.read(current),
        source.read(current),
      ]);
      expect(reads).toEqual([
        [current, 'STALE'],
        [current, 'STALE'],
      ]);
      await expect(source.read(current)).resolves.toEqual([current, 'STALE']);
      expect(fetchDatafile).toHaveBeenCalledTimes(1);
      pending.resolve(fresh);
      await settlePromises();
      expect(onData).toHaveBeenCalledExactlyOnceWith(fresh);
    });

    it('rechecks the next request header after a HIT', async () => {
      const current = tagData(datafile(), 'provided');
      await expect(source.read(current)).resolves.toEqual([current, 'HIT']);
      setVersion(CURRENT_TIMESTAMP + 20_000);

      const result = await source.read(current);

      expect(result?.[1]).toBe('STALE');
      expect(fetchDatafile).toHaveBeenCalledTimes(1);
    });

    it('rechecks availability when the next request has no header', async () => {
      const current = tagData(datafile(), 'provided');
      await expect(source.read(current)).resolves.toEqual([current, 'HIT']);
      setHeader(undefined);

      await expect(source.read(current)).resolves.toBeUndefined();
      expect(fetchDatafile).not.toHaveBeenCalled();
    });

    it('rechecks a request after an earlier read had no header', async () => {
      const current = tagData(datafile(), 'provided');
      setHeader(undefined);
      await expect(source.read(current)).resolves.toBeUndefined();
      setVersion(CURRENT_TIMESTAMP);

      await expect(source.read(current)).resolves.toEqual([current, 'HIT']);
    });

    it('uses updated current data after a background fetch', async () => {
      setVersion(CURRENT_TIMESTAMP + 1);
      const current = tagData(datafile(), 'provided');
      setVersion(CURRENT_TIMESTAMP);
      await source.read(current);
      setVersion(CURRENT_TIMESTAMP + 1);

      const fresh = datafile(CURRENT_TIMESTAMP + 1);
      vi.mocked(fetchDatafile).mockResolvedValueOnce(fresh);
      await expect(source.read(current)).resolves.toEqual([current, 'STALE']);
      await settlePromises();
      const updated = tagData(fresh, 'fetched');

      const result = await source.read(updated);

      expect(result).toEqual([updated, 'HIT']);
      expect(result?.[0]).toBe(updated);
      expect(fetchDatafile).toHaveBeenCalledTimes(1);
    });

    it('returns HIT rather than replaying MISS after a blocking fetch', async () => {
      setVersion(CURRENT_TIMESTAMP + 20_000);
      const first = await source.read(tagData(datafile(), 'provided'));
      expect(first?.[1]).toBe('MISS');
      const updated = tagData(datafile(CURRENT_TIMESTAMP + 20_000), 'fetched');

      const second = await source.read(updated);

      expect(second).toEqual([updated, 'HIT']);
      expect(second?.[0]).toBe(updated);
      expect(fetchDatafile).toHaveBeenCalledTimes(1);
    });

    it('starts another fetch when a later request requires newer data', async () => {
      setVersion(CURRENT_TIMESTAMP + 20_000);
      await source.read(tagData(datafile(), 'provided'));
      const updated = tagData(datafile(CURRENT_TIMESTAMP + 20_000), 'fetched');
      const newer = datafile(CURRENT_TIMESTAMP + 40_000);
      setVersion(newer.configUpdatedAt);
      vi.mocked(fetchDatafile).mockResolvedValueOnce(newer);

      vi.setSystemTime(CURRENT_TIMESTAMP + 10_001);
      const result = await source.read(updated);

      expect(fetchDatafile).toHaveBeenCalledTimes(2);
      expect(result).toEqual([
        {
          ...newer,
          _origin: 'fetched',
          _fetchedAt: CURRENT_TIMESTAMP + 10_001,
        },
        'MISS',
      ]);
      expect(onData).toHaveBeenCalledTimes(2);
    });

    it('retries after a rejected blocking fetch', async () => {
      setVersion(CURRENT_TIMESTAMP + 20_000);
      const current = tagData(datafile(), 'provided');
      const failure = new Error('Blocking fetch failed');
      const fresh = datafile(CURRENT_TIMESTAMP + 20_000);
      vi.mocked(fetchDatafile)
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(fresh);
      await expect(source.read(current)).rejects.toBe(failure);
      expect(onData).not.toHaveBeenCalled();

      await expect(source.read(current)).resolves.toEqual([
        { ...fresh, _origin: 'fetched', _fetchedAt: CURRENT_TIMESTAMP },
        'MISS',
      ]);
      expect(fetchDatafile).toHaveBeenCalledTimes(2);
      expect(onData).toHaveBeenCalledExactlyOnceWith(fresh);
    });

    it('handles background rejection and retries on a later read', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      setVersion(CURRENT_TIMESTAMP + 1);
      const current = tagData(datafile(), 'provided');
      setVersion(CURRENT_TIMESTAMP);
      await source.read(current);
      setVersion(CURRENT_TIMESTAMP + 1);

      const pending = deferred<BundledDefinitions>();
      const fresh = datafile(CURRENT_TIMESTAMP + 1);
      vi.mocked(fetchDatafile)
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(fresh);
      await expect(source.read(current)).resolves.toEqual([current, 'STALE']);

      // Do not swallow rejections from HeaderSource: Vitest must report an
      // unhandled rejection if the background refresh has no error handler.
      const failure = new Error('HeaderSource background refresh failed');
      pending.reject(failure);
      await settlePromises();
      expect(onData).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        '@vercel/flags-core: Header refresh failed:',
        failure,
      );
      await expect(source.read(current)).resolves.toEqual([current, 'STALE']);
      await settlePromises();
      expect(fetchDatafile).toHaveBeenCalledTimes(2);
      expect(onData).toHaveBeenCalledExactlyOnceWith(fresh);
    });
  });

  describe('stop', () => {
    it.each([
      1, 20_000,
    ])('keeps a restarted fetch isolated from a late aborted fetch for delta %i ms', async (delta) => {
      setVersion(CURRENT_TIMESTAMP + delta);
      const current = tagData(datafile(), delta === 1 ? 'fetched' : 'provided');
      const abandoned = deferred<BundledDefinitions>();
      const pending = deferred<BundledDefinitions>();
      const fresh = datafile(CURRENT_TIMESTAMP + delta);
      vi.mocked(fetchDatafile)
        .mockReturnValueOnce(abandoned.promise)
        .mockReturnValueOnce(pending.promise);
      const abandonedOutcome = source
        .read(current)
        .catch((error: unknown) => error);
      await settlePromises();

      source.stop();
      const restarted = source.read(current);
      abandoned.resolve(fresh);
      const outcome = await abandonedOutcome;
      await settlePromises();

      expect(onData).not.toHaveBeenCalled();
      if (delta > 10_000) {
        expect(outcome).toMatchObject({ name: 'AbortError' });
      }
      const concurrent = source.read(current);
      expect(fetchDatafile).toHaveBeenCalledTimes(2);
      pending.resolve(fresh);
      await Promise.all([restarted, concurrent]);
      await settlePromises();

      expect(onData).toHaveBeenCalledExactlyOnceWith(fresh);
      const updated = tagData(fresh, 'fetched');
      await expect(source.read(updated)).resolves.toEqual([updated, 'HIT']);
      expect(fetchDatafile).toHaveBeenCalledTimes(2);
    });

    it.each([
      1, 20_000,
    ])('aborts a pending fetch for delta %i ms', async (delta) => {
      setVersion(CURRENT_TIMESTAMP + delta);
      const pending = deferred<BundledDefinitions>();
      vi.mocked(fetchDatafile).mockReturnValueOnce(pending.promise);
      const current = tagData(datafile(), delta === 1 ? 'fetched' : 'provided');
      const read = source.read(current);
      const outcome = read.catch(() => undefined);
      await settlePromises();
      const signal = vi.mocked(fetchDatafile).mock.calls[0]?.[0].signal;

      source.stop();
      // Settle even if the transport ignores cancellation, keeping tests isolated.
      pending.resolve(datafile(CURRENT_TIMESTAMP + delta));
      await outcome;
      await settlePromises();

      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(true);
    });

    it.each([
      1, 20_000,
    ])('suppresses late data emissions for delta %i ms', async (delta) => {
      setVersion(CURRENT_TIMESTAMP + delta);
      const pending = deferred<BundledDefinitions>();
      vi.mocked(fetchDatafile).mockReturnValueOnce(pending.promise);
      const current = tagData(datafile(), delta === 1 ? 'fetched' : 'provided');
      const read = source.read(current);
      const outcome = read.catch(() => undefined);
      await settlePromises();
      expect(onData).not.toHaveBeenCalled();

      source.stop();
      pending.resolve(datafile(CURRENT_TIMESTAMP + delta));
      await outcome;
      await settlePromises();

      expect(onData).not.toHaveBeenCalled();
    });
  });
});

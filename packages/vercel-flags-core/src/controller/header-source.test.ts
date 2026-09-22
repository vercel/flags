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
      vercel: true,
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
  it('exposes fetchedAt without internal metadata in controller views', async () => {
    setVersion(CURRENT_TIMESTAMP + 20_000);
    const controller = new Controller({
      auth,
      datafile: datafile(),
      buildStep: false,
      vercel: true,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response()),
    });
    try {
      await controller.initialize();
      for (const view of [
        await controller.read(),
        await controller.getDatafile(),
      ]) {
        expect(view).toStrictEqual({
          ...datafile(CURRENT_TIMESTAMP + 20_000),
          fetchedAt: CURRENT_TIMESTAMP,
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

      expect(source.request()(current)).toBe(CURRENT_TIMESTAMP);
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

      expect(source.request()(current)).toBe(CURRENT_TIMESTAMP);
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

      expect(source.request()(tagData(datafile(), 'provided'))).toBeUndefined();
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

      expect(source.request()(current)).toBe(CURRENT_TIMESTAMP);
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
      const result = source.request()(tagData(datafile(), 'provided'));

      expect.soft(result).toBeUndefined();
      expect.soft(fetchDatafile).not.toHaveBeenCalled();
      expect.soft(onData).not.toHaveBeenCalled();
    });
  });

  it('keeps observations outside data and refuses to renew an invalidated version', () => {
    const current = Object.freeze(tagData(datafile(), 'provided'));
    expect(source.request()(current)).toBe(CURRENT_TIMESTAMP);
    expect(source.confirmedAt(current)).toBe(CURRENT_TIMESTAMP);
    setVersion(CURRENT_TIMESTAMP + 1);
    source.request()(current);
    vi.setSystemTime(CURRENT_TIMESTAMP + 20_000);
    setVersion(CURRENT_TIMESTAMP);
    source.request()(current);
    expect(source.matches(current, CURRENT_TIMESTAMP)).toBe(false);
    expect(source.confirmedAt(current)).toBe(CURRENT_TIMESTAMP);
    expect(current).not.toHaveProperty('_lastSeen');
  });

  it('captures each request before a cold fetch discovers its project', () => {
    const request = source.request();
    expect(request(undefined)).toBeUndefined();
    setVersion(CURRENT_TIMESTAMP + 1);
    expect(request(tagData(datafile(), 'provided'))).toBe(CURRENT_TIMESTAMP);
  });

  it('shares transport, emits once, and timestamps only in the controller', async () => {
    const pending = deferred<BundledDefinitions>();
    vi.mocked(fetchDatafile).mockReturnValueOnce(pending.promise);
    const reads = [source.refresh(), source.refresh(), source.refresh()];
    expect(fetchDatafile).toHaveBeenCalledTimes(1);
    const fresh = datafile();
    pending.resolve(fresh);
    expect(await Promise.all(reads)).toEqual([fresh, fresh, fresh]);
    expect(onData).toHaveBeenCalledExactlyOnceWith(fresh);
    expect(fresh).not.toHaveProperty('fetchedAt');
  });

  it('releases rejected transport work so a later read can recover', async () => {
    const failure = new Error('Fetch failed');
    vi.mocked(fetchDatafile).mockRejectedValueOnce(failure);
    await expect(source.refresh()).rejects.toBe(failure);
    await source.refresh();
    expect(fetchDatafile).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it('aborts, clears observations, and isolates restarted work from late responses', async () => {
    const current = tagData(datafile(), 'provided');
    source.request()(current);
    const abandoned = deferred<BundledDefinitions>();
    const pending = deferred<BundledDefinitions>();
    vi.mocked(fetchDatafile)
      .mockReturnValueOnce(abandoned.promise)
      .mockReturnValueOnce(pending.promise);
    const outcome = source.refresh().catch((error: unknown) => error);
    const signal = vi.mocked(fetchDatafile).mock.calls[0]?.[0].signal;
    source.stop();
    expect(signal?.aborted).toBe(true);
    expect(source.confirmedAt(current)).toBe(-Infinity);
    const restarted = source.refresh();
    abandoned.resolve(datafile());
    expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(onData).not.toHaveBeenCalled();
    const concurrent = source.refresh();
    expect(fetchDatafile).toHaveBeenCalledTimes(2);
    pending.resolve(datafile());
    await Promise.all([restarted, concurrent]);
    expect(onData).toHaveBeenCalledExactlyOnceWith(datafile());
  });
});

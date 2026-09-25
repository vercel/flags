import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BundledDefinitions,
  createClient,
  type FlagsClient,
} from './index.default';
import { readBundledDefinitions } from './utils/read-bundled-definitions';

vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(),
}));

function datafile(version = 1, enabled = true): BundledDefinitions {
  return {
    projectId: 'prj_retry_test',
    environment: 'production',
    configUpdatedAt: version,
    revision: version,
    digest: `digest-${version}`,
    definitions: {
      feature: {
        environments: { production: enabled ? 1 : 0 },
        variants: [false, true],
      },
    },
  };
}

const clients = new Set<FlagsClient>();
const dataFetch = vi.fn<typeof fetch>();

function client(options: Parameters<typeof createClient>[1] = {}) {
  const instance = createClient('vf_server_retry_test', {
    buildStep: false,
    stream: false,
    polling: false,
    fetch: async (input, init) => {
      if (String(input).endsWith('/v1/datafile')) return dataFetch(input, init);
      if (String(input).endsWith('/v1/ingest')) return new Response();
      throw new Error(`Unexpected fetch: ${input}`);
    },
    ...options,
  });
  clients.add(instance);
  return instance;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.mocked(readBundledDefinitions).mockReset().mockResolvedValue({
    state: 'missing-file',
    definitions: null,
  });
  dataFetch
    .mockReset()
    .mockImplementation(async () => Response.json(datafile()));
});

afterEach(async () => {
  await Promise.all([...clients].map((instance) => instance.shutdown()));
  clients.clear();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('datafile retries through the public API', () => {
  it.each([
    'build',
    'offline evaluation',
    'offline initialization',
    'getDatafile',
    'polling',
  ] as const)('recovers from transient failures during %s', async (mode) => {
    dataFetch
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const instance = client({
      buildStep: mode === 'build',
      polling: mode === 'polling',
    });
    const result =
      mode === 'getDatafile'
        ? instance.getDatafile()
        : mode === 'offline initialization'
          ? instance.initialize()
          : instance.evaluate('feature');

    await vi.advanceTimersByTimeAsync(299);
    expect(dataFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(dataFetch).toHaveBeenCalledTimes(3);
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect(dataFetch).toHaveBeenCalledTimes(3);
  });

  it('shares the build fetch and its retries across concurrent reads', async () => {
    dataFetch.mockRejectedValueOnce(new Error('Network unavailable'));
    const instance = client({ buildStep: true });
    const first = instance.evaluate('feature');
    const second = instance.getDatafile();
    await vi.advanceTimersByTimeAsync(100);

    expect((await first).value).toBe(true);
    expect((await second).projectId).toBe('prj_retry_test');
    expect(dataFetch).toHaveBeenCalledTimes(2);
  });

  it('retries scheduled polls before updating cached data', async () => {
    const instance = client({ polling: true });
    await instance.evaluate('feature');
    dataFetch
      .mockReset()
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockImplementation(async () => Response.json(datafile(2, false)));

    await vi.advanceTimersByTimeAsync(30_299);
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect(dataFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect((await instance.evaluate('feature')).value).toBe(false);
    expect(dataFetch).toHaveBeenCalledTimes(3);
  });

  it('keeps polling after retries are exhausted', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const instance = client({ polling: true });
    await instance.evaluate('feature');
    const failure = new Error('Network unavailable');
    dataFetch.mockReset().mockRejectedValue(failure);
    await vi.advanceTimersByTimeAsync(30_300);

    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Poll failed:',
      failure,
    );
    expect(dataFetch).toHaveBeenCalledTimes(3);
    expect((await instance.evaluate('feature')).value).toBe(true);

    dataFetch.mockImplementation(async () => Response.json(datafile(2, false)));
    await vi.advanceTimersByTimeAsync(29_700);
    expect((await instance.evaluate('feature')).value).toBe(false);
    expect(dataFetch).toHaveBeenCalledTimes(4);
  });

  it.each([
    'initial',
    'scheduled',
  ] as const)('cancels %s polling retries on shutdown', async (phase) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const instance = client({ polling: true, datafile: datafile() });
    if (phase === 'scheduled') await instance.initialize();
    dataFetch.mockReset().mockRejectedValue(new Error('Network unavailable'));
    const initializing =
      phase === 'initial' ? instance.initialize() : undefined;
    await vi.advanceTimersByTimeAsync(phase === 'initial' ? 0 : 30_000);
    expect(dataFetch).toHaveBeenCalledTimes(1);
    const signal = dataFetch.mock.calls[0]?.[1]?.signal;

    await instance.shutdown();
    clients.delete(instance);
    await initializing;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(signal?.aborted).toBe(true);
    expect(dataFetch).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

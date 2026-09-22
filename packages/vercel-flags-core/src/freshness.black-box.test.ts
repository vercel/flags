/** Shared freshness through public APIs; only network/filesystem boundaries mocked. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, type FlagsClient } from './index.default';
import { setRequestContext } from './test-utils';
import { readBundledDefinitions } from './utils/read-bundled-definitions';

vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(),
}));
const NOW = 1_700_000_000_000;
const KEY = 'vf_server_freshness';
const PROJECT = 'prj_freshness';
const clients = new Set<FlagsClient>();
const network = vi.fn<typeof fetch>();
let clearContext = () => {};
let errors: ReturnType<typeof vi.spyOn>;

function data(version = 1, value = true, fetchedAt: number | undefined = NOW) {
  return {
    projectId: PROJECT,
    environment: 'production',
    digest: `d${version}`,
    revision: version,
    configUpdatedAt: version,
    fetchedAt,
    definitions: {
      feature: {
        variants: [false, true],
        environments: { production: value ? 1 : 0 },
      },
    },
  };
}
function version(value?: number) {
  clearContext();
  clearContext = setRequestContext(
    value
      ? { 'x-vercel-flags-config-versions': `flags_${PROJECT}=${value}` }
      : {},
  );
}
function client(options: Parameters<typeof createClient>[1] = {}) {
  const instance = createClient(KEY, {
    buildStep: false,
    vercel: true,
    datafile: data(),
    fetch: (input, init) =>
      String(input).endsWith('/v1/ingest')
        ? Promise.resolve(new Response())
        : network(input, init),
    disableMetrics: true,
    waitUntil: () => {},
    ...options,
  });
  clients.add(instance);
  return instance;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.mocked(readBundledDefinitions).mockReset().mockResolvedValue({
    state: 'missing-file',
    definitions: null,
  });
  network.mockReset().mockRejectedValue(new Error('Offline'));
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  version();
});
afterEach(async () => {
  await Promise.all([...clients].map((instance) => instance.shutdown()));
  clients.clear();
  clearContext();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function expectExpired(instance: FlagsClient) {
  expect(await instance.evaluate('feature', false)).toMatchObject({
    value: false,
    reason: 'error',
  });
  expect(
    await instance.bulkEvaluate([{ key: 'feature', defaultValue: false }]),
  ).toMatchObject({ feature: { value: false, reason: 'error' } });
  await expect(instance.evaluate('feature')).rejects.toThrow();
  await expect(instance.bulkEvaluate([{ key: 'feature' }])).rejects.toThrow();
  await expect(instance.getDatafile()).rejects.toThrow();
}

describe('shared runtime freshness', () => {
  it.each([
    -1,
    -Infinity,
    NaN,
  ])('rejects staleIfErrorMs=%s', (staleIfErrorMs) => {
    expect(() => client({ staleIfErrorMs })).toThrow('staleIfErrorMs');
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('expires %s fallback at SWR + SIE for every API with no usable source', async (origin) => {
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      state: 'ok',
      definitions: data(),
    });
    const instance = client({
      datafile: origin === 'provided' ? data() : undefined,
      staleWhileRevalidateMs: 10,
      staleIfErrorMs: 20,
    });
    vi.setSystemTime(NOW + 30);
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect((await instance.getDatafile()).fetchedAt).toBe(NOW);
    vi.setSystemTime(NOW + 31);
    await expectExpired(instance);
    expect(network).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    NaN,
    -1,
    Infinity,
  ])('requires evidence for finite windows with fetchedAt=%s', async (fetchedAt) => {
    const instance = client({
      datafile: { ...data(), fetchedAt },
      staleIfErrorMs: 100,
    });
    await expectExpired(instance);
    expect(network).not.toHaveBeenCalled();
  });

  it('retains unknown-age fallback by default, including failed initialization', async () => {
    const input = { ...data(), fetchedAt: undefined };
    const instance = client({ vercel: false, stream: false, datafile: input });
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect((await instance.getDatafile()).fetchedAt).toBeUndefined();
    expect(network).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Poll failed:',
      expect.any(Error),
    );
  });

  it.each([
    'build',
    'offline',
  ] as const)('keeps %s caches static with both windows disabled', async (mode) => {
    const instance = client({
      buildStep: mode === 'build',
      stream: false,
      polling: false,
      staleWhileRevalidateMs: 0,
      staleIfErrorMs: 0,
      datafile: { ...data(), fetchedAt: undefined },
    });
    vi.setSystemTime(NOW + 1_000_000);
    version(100);
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect(
      (await instance.bulkEvaluate([{ key: 'feature' }])).feature?.value,
    ).toBe(true);
    expect((await instance.getDatafile()).configUpdatedAt).toBe(1);
    expect(network).not.toHaveBeenCalled();
  });

  it('shares one background handler, registration and error across all APIs', async () => {
    const waitUntil = vi.fn();
    const instance = client({ waitUntil });
    version(1);
    await instance.evaluate('feature');
    waitUntil.mockClear();
    const pending = deferred<Response>();
    network.mockReturnValueOnce(pending.promise);
    version(2);
    await Promise.all([
      instance.evaluate('feature'),
      instance.bulkEvaluate([{ key: 'feature' }]),
      instance.getDatafile(),
    ]);
    expect(network).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledExactlyOnceWith(expect.any(Promise));
    pending.reject(new Error('Failed refresh'));
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Background refresh failed:',
      expect.any(Error),
    );
  });

  it('checks each concurrent header requirement after the shared fetch', async () => {
    const instance = client({ staleWhileRevalidateMs: 0, staleIfErrorMs: 0 });
    await instance.initialize();
    const pending = deferred<Response>();
    network.mockReturnValueOnce(pending.promise);
    version(2);
    const first = instance.getDatafile();
    await vi.advanceTimersByTimeAsync(0);
    version(3);
    const second = instance.evaluate('feature', false);
    await vi.advanceTimersByTimeAsync(0);
    pending.resolve(Response.json(data(2)));
    expect((await first).configUpdatedAt).toBe(2);
    expect(await second).toMatchObject({
      value: false,
      reason: 'error',
      errorMessage: expect.stringContaining('required version'),
    });
    expect(network).toHaveBeenCalledTimes(1);
    network.mockResolvedValueOnce(Response.json(data(3)));
    expect((await instance.getDatafile()).configUpdatedAt).toBe(3);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('checks the captured header even when a cold fetch discovers the project', async () => {
    const instance = client({
      datafile: undefined,
      staleWhileRevalidateMs: 0,
      staleIfErrorMs: 0,
    });
    version(3);
    network.mockResolvedValueOnce(Response.json(data(2)));
    await expect(instance.getDatafile()).rejects.toThrow('required version');
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('does not renew finite freshness from old headers or regressed responses', async () => {
    const instance = client({ staleWhileRevalidateMs: 10, staleIfErrorMs: 20 });
    version(1);
    await instance.evaluate('feature');
    vi.setSystemTime(NOW + 11);
    version(2);
    network.mockResolvedValueOnce(Response.json(data(0, false)));
    expect((await instance.evaluate('feature')).value).toBe(true);
    vi.setSystemTime(NOW + 31);
    version(1);
    await expectExpired(instance);
    expect(network).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it('uses the finite error extension after a failed refresh, then recovers', async () => {
    const instance = client({ staleWhileRevalidateMs: 10, staleIfErrorMs: 20 });
    version(2);
    vi.setSystemTime(NOW + 30);
    expect((await instance.evaluate('feature')).value).toBe(true);
    vi.setSystemTime(NOW + 31);
    await expectExpired(instance);
    network.mockResolvedValueOnce(Response.json(data(2, false)));
    expect((await instance.evaluate('feature')).value).toBe(false);
    expect((await instance.getDatafile()).fetchedAt).toBe(NOW + 31);
    expect(errors).not.toHaveBeenCalled();
  });

  it('confirms unchanged polls without replacing the configuration or fetchedAt', async () => {
    const instance = client({
      vercel: false,
      stream: false,
      staleWhileRevalidateMs: 10,
      staleIfErrorMs: 20,
    });
    network.mockResolvedValueOnce(Response.json(data()));
    await instance.initialize();
    vi.setSystemTime(NOW + 100);
    network.mockResolvedValueOnce(Response.json(data(1, false)));
    const results = await Promise.all([
      instance.evaluate('feature'),
      instance.getDatafile(),
    ]);
    expect(results[0].value).toBe(true);
    expect(results[1].fetchedAt).toBe(NOW);
    expect(network).toHaveBeenCalledTimes(2);
    vi.setSystemTime(NOW + 130);
    expect((await instance.evaluate('feature')).value).toBe(true);
    vi.setSystemTime(NOW + 131);
    await expectExpired(instance);
    expect(errors).toHaveBeenCalledTimes(6);
  });

  it('does not confirm regressed polls, including at the same clock tick', async () => {
    const instance = client({
      vercel: false,
      stream: false,
      staleWhileRevalidateMs: 0,
      staleIfErrorMs: 0,
    });
    network.mockResolvedValueOnce(Response.json(data()));
    await instance.initialize();
    network.mockResolvedValueOnce(Response.json(data(0, false)));
    await expect(instance.getDatafile()).rejects.toThrow(
      'Poll did not confirm',
    );
    expect(errors).not.toHaveBeenCalled();
  });

  it('recovers on the polling interval after initial failure without reads', async () => {
    const instance = client({
      vercel: false,
      stream: false,
      datafile: { ...data(), fetchedAt: undefined },
      staleIfErrorMs: 0,
    });
    await instance.initialize();
    await expectExpired(instance);
    expect(network).toHaveBeenCalledTimes(1);
    network.mockResolvedValueOnce(Response.json(data(2, false)));
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await instance.getDatafile()).configUpdatedAt).toBe(2);
    expect(network).toHaveBeenCalledTimes(2);
    expect(errors).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Poll failed:',
      expect.any(Error),
    );
  });

  it.each([
    'header',
    'poll',
  ] as const)('rejects pending %s reads on shutdown and ignores late arrivals', async (source) => {
    const instance = client({
      vercel: source === 'header',
      stream: false,
      staleWhileRevalidateMs: 0,
    });
    if (source === 'poll') network.mockResolvedValueOnce(Response.json(data()));
    await instance.initialize();
    version(2);
    const pending = deferred<Response>();
    network.mockReturnValueOnce(pending.promise);
    const outcome = instance.getDatafile().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    const signal = network.mock.lastCall?.[1]?.signal;
    await instance.shutdown();
    clients.delete(instance);
    expect(signal?.aborted).toBe(true);
    pending.resolve(Response.json(data(2)));
    expect(await outcome).toMatchObject({
      message: expect.stringContaining('shut down'),
    });
    expect(errors).not.toHaveBeenCalled();
  });

  it('keeps a connected stream fresh and measures expiry from disconnect, then recovers', async () => {
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    const stream = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            writer = controller;
          },
        }),
      );
    const push = (value: unknown) =>
      writer.enqueue(new TextEncoder().encode(`${JSON.stringify(value)}\n`));
    network.mockImplementation(async () => stream());
    const instance = client({
      vercel: false,
      staleWhileRevalidateMs: 10,
      staleIfErrorMs: 20,
    });
    const init = instance.initialize();
    await vi.advanceTimersByTimeAsync(0);
    push({
      type: 'primed',
      revision: 1,
      projectId: PROJECT,
      environment: 'production',
    });
    await init;
    vi.setSystemTime(NOW + 1_000_000);
    expect((await instance.getDatafile()).metrics.cacheStatus).toBe('HIT');
    writer.close();
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(NOW + 1_000_030);
    expect((await instance.evaluate('feature')).value).toBe(true);
    vi.setSystemTime(NOW + 1_000_031);
    await expectExpired(instance);
    await vi.advanceTimersByTimeAsync(2_000);
    // A regressed response on the reconnected transport cannot renew freshness.
    push({ type: 'datafile', data: data(0, false) });
    await vi.advanceTimersByTimeAsync(0);
    await expectExpired(instance);
    push({ type: 'datafile', data: data(2, false) });
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.evaluate('feature')).value).toBe(false);
    expect((await instance.getDatafile()).metrics.cacheStatus).toBe('HIT');
    expect(errors).not.toHaveBeenCalled();
  });
  it('rejects unknown fallback after failed stream initialization with finite windows', async () => {
    network.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const instance = client({
      vercel: false,
      datafile: { ...data(), fetchedAt: undefined },
      staleIfErrorMs: 0,
    });
    await expectExpired(instance);
    expect(network).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it('shares the initial blocking poll across concurrent public reads', async () => {
    const pending = deferred<Response>();
    network.mockReturnValueOnce(pending.promise);
    const instance = client({
      vercel: false,
      stream: false,
      staleWhileRevalidateMs: 10,
      staleIfErrorMs: 0,
    });
    const reads = [
      instance.evaluate('feature'),
      instance.getDatafile(),
      instance.bulkEvaluate([{ key: 'feature' }]),
    ];
    await vi.advanceTimersByTimeAsync(0);
    expect(network).toHaveBeenCalledTimes(1);
    pending.resolve(Response.json(data(2)));
    await Promise.all(reads);
    expect(network).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });
  it('shares cold initialization before selecting header mode across all reads', async () => {
    const bundle =
      deferred<Awaited<ReturnType<typeof readBundledDefinitions>>>();
    vi.mocked(readBundledDefinitions).mockReturnValueOnce(bundle.promise);
    const instance = client({ datafile: undefined });
    version(1);
    const reads = [
      instance.getDatafile(),
      instance.getDatafile(),
      instance.evaluate('feature'),
    ];
    await vi.advanceTimersByTimeAsync(0);
    expect(network).not.toHaveBeenCalled();
    expect(readBundledDefinitions).toHaveBeenCalledTimes(1);
    bundle.resolve({ state: 'ok', definitions: data() });
    const results = await Promise.all(reads);
    for (const result of results) expect(result.metrics?.mode).toBe('vercel');
    expect(network).not.toHaveBeenCalled();
  });
});

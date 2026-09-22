/** Outage grace through public APIs; only network/filesystem boundaries mocked. */
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

describe('stale-if-error grace period', () => {
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
  ] as const)('starts the grace period for old %s data on initial poll failure', async (origin) => {
    const fallback = { ...data(), fetchedAt: NOW - 86_400_000 };
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      state: 'ok',
      definitions: fallback,
    });
    const instance = client({
      vercel: false,
      stream: false,
      datafile: origin === 'provided' ? fallback : undefined,
      staleIfErrorMs: 20,
    });
    await instance.initialize();
    vi.setSystemTime(NOW + 20);
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect((await instance.getDatafile()).fetchedAt).toBe(fallback.fetchedAt);
    vi.setSystemTime(NOW + 21);
    await expectExpired(instance);
    expect(network).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Poll failed:',
      expect.any(Error),
    );
  });

  it.each([
    undefined,
    NaN,
    -1,
    Infinity,
  ])('does not need a fetchedAt timestamp for outage fallback (%s)', async (fetchedAt) => {
    const instance = client({
      vercel: false,
      stream: false,
      datafile: { ...data(), fetchedAt },
      staleIfErrorMs: 20,
    });
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect((await instance.getDatafile()).fetchedAt).toBeUndefined();
    vi.setSystemTime(NOW + 21);
    await expectExpired(instance);
    expect(network).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Poll failed:',
      expect.any(Error),
    );
  });

  it('keeps healthy cached data without headers regardless of age, even with zero grace', async () => {
    const instance = client({
      staleIfErrorMs: 0,
      datafile: { ...data(), fetchedAt: undefined },
    });
    vi.setSystemTime(NOW + 86_400_000);
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect((await instance.getDatafile()).configUpdatedAt).toBe(1);
    expect(network).not.toHaveBeenCalled();
  });

  it('keeps unknown-age fallback indefinitely by default after a failed poll', async () => {
    const instance = client({
      vercel: false,
      stream: false,
      datafile: { ...data(), fetchedAt: undefined },
    });
    await instance.initialize();
    vi.setSystemTime(NOW + 86_400_000);
    expect((await instance.evaluate('feature')).value).toBe(true);
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
    });
    version(100);
    vi.setSystemTime(NOW + 86_400_000);
    expect((await instance.evaluate('feature')).value).toBe(true);
    expect(
      (await instance.bulkEvaluate([{ key: 'feature' }])).feature?.value,
    ).toBe(true);
    expect((await instance.getDatafile()).configUpdatedAt).toBe(1);
    expect(network).not.toHaveBeenCalled();
  });

  it('does not extend an outage on repeated polls, and an unchanged successful poll resets it', async () => {
    const instance = client({
      vercel: false,
      stream: false,
      staleIfErrorMs: 30_000,
    });
    network.mockResolvedValueOnce(Response.json(data()));
    await instance.initialize();
    await vi.advanceTimersByTimeAsync(30_000); // first failure
    expect((await instance.evaluate('feature')).value).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000); // second failure, original deadline
    expect((await instance.getDatafile()).fetchedAt).toBe(NOW);
    await vi.advanceTimersByTimeAsync(1);
    await expectExpired(instance);
    expect(network).toHaveBeenCalledTimes(3); // reads never trigger polling
    network.mockResolvedValueOnce(Response.json(data(1, false)));
    await vi.advanceTimersByTimeAsync(29_999);
    expect((await instance.evaluate('feature')).value).toBe(true); // unchanged version preserves payload
    expect((await instance.getDatafile()).fetchedAt).toBe(NOW);
    await vi.advanceTimersByTimeAsync(30_000); // new outage has its own full grace
    expect((await instance.evaluate('feature')).value).toBe(true);
    await vi.advanceTimersByTimeAsync(30_001);
    await expectExpired(instance);
    expect(network).toHaveBeenCalledTimes(6);
    expect(errors).toHaveBeenCalledTimes(4);
    for (const call of errors.mock.calls)
      expect(call).toEqual([
        '@vercel/flags-core: Poll failed:',
        expect.any(Error),
      ]);
  });

  it('does not let regressed poll responses clear an outage', async () => {
    const instance = client({
      vercel: false,
      stream: false,
      staleIfErrorMs: 20,
    });
    await instance.initialize();
    network.mockResolvedValueOnce(Response.json(data(0, false)));
    await vi.advanceTimersByTimeAsync(30_000);
    await expectExpired(instance);
    network.mockResolvedValueOnce(Response.json(data(2, false)));
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await instance.evaluate('feature')).value).toBe(false);
    expect(network).toHaveBeenCalledTimes(3);
    expect(errors).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Poll failed:',
      expect.any(Error),
    );
  });

  it('disables error fallback with zero without adding the SWR duration', async () => {
    const instance = client({
      vercel: false,
      stream: false,
      staleWhileRevalidateMs: 100_000,
      staleIfErrorMs: 0,
    });
    await expectExpired(instance);
    expect(network).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Poll failed:',
      expect.any(Error),
    );
  });

  it('starts fetch grace on failure, refuses to extend it, and clears it on accepted data', async () => {
    const instance = client({
      staleWhileRevalidateMs: 0,
      staleIfErrorMs: 20,
      datafile: data(1, true, NOW - 86_400_000),
    });
    version(2);
    expect((await instance.evaluate('feature')).value).toBe(true);
    vi.setSystemTime(NOW + 20);
    expect((await instance.getDatafile()).configUpdatedAt).toBe(1);
    vi.setSystemTime(NOW + 21);
    await expectExpired(instance);
    network.mockResolvedValueOnce(Response.json(data(2, false)));
    expect((await instance.evaluate('feature')).value).toBe(false);
    version(3);
    vi.setSystemTime(NOW + 100);
    expect((await instance.evaluate('feature')).value).toBe(false); // new failure, new grace
    vi.setSystemTime(NOW + 121);
    await expectExpired(instance);
    expect(errors).not.toHaveBeenCalled();
  });

  it('clears a fetch outage with a matching header but not an older matching request', async () => {
    const instance = client({ staleWhileRevalidateMs: 0, staleIfErrorMs: 20 });
    version(2);
    await instance.evaluate('feature'); // starts outage; newest header is 2
    version(1);
    vi.setSystemTime(NOW + 21);
    await expectExpired(instance); // matching cached version cannot undo invalidation
    network.mockResolvedValueOnce(Response.json(data(2)));
    version(2);
    await instance.getDatafile();
    version(3);
    await instance.evaluate('feature'); // another failure
    vi.setSystemTime(NOW + 42);
    version(2);
    await expectExpired(instance);
    expect(errors).not.toHaveBeenCalled();
  });

  it('shares one background handler and starts grace when the background fetch fails', async () => {
    const waitUntil = vi.fn();
    const instance = client({ waitUntil, staleIfErrorMs: 20 });
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
    vi.setSystemTime(NOW + 5);
    pending.reject(new Error('Failed refresh'));
    await vi.advanceTimersByTimeAsync(0);
    version(); // no new evidence and no new refresh
    vi.setSystemTime(NOW + 25);
    expect((await instance.getDatafile()).configUpdatedAt).toBe(1);
    vi.setSystemTime(NOW + 26);
    await expectExpired(instance);
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

  it('checks the captured header when a cold fetch discovers the project', async () => {
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

  it.each([
    'header',
    'poll',
  ] as const)('ignores late %s arrivals during shutdown', async (source) => {
    const instance = client({
      vercel: source === 'header',
      stream: false,
      staleWhileRevalidateMs: 0,
    });
    const pending = deferred<Response>();
    network.mockReturnValueOnce(pending.promise);
    version(2);
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

  it('starts a full grace period when a long-lived stream disconnects, and resets on confirmation', async () => {
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    network.mockImplementation(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              writer = controller;
            },
          }),
        ),
    );
    const push = (message: unknown) =>
      writer.enqueue(new TextEncoder().encode(`${JSON.stringify(message)}\n`));
    const primed = {
      type: 'primed',
      revision: 1,
      projectId: PROJECT,
      environment: 'production',
    };
    const instance = client({ vercel: false, staleIfErrorMs: 20 });
    const init = instance.initialize();
    await vi.advanceTimersByTimeAsync(0);
    push(primed);
    await init;
    vi.setSystemTime(NOW + 86_400_000);
    expect((await instance.getDatafile()).metrics.cacheStatus).toBe('HIT');
    writer.close();
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(NOW + 86_400_020);
    expect((await instance.evaluate('feature')).value).toBe(true);
    vi.setSystemTime(NOW + 86_400_021);
    await expectExpired(instance);
    await vi.advanceTimersByTimeAsync(2_000);
    push({ type: 'datafile', data: data(0, false) }); // rejected update cannot clear the outage
    await vi.advanceTimersByTimeAsync(0);
    await expectExpired(instance);
    writer.close(); // another disconnect cannot restart the grace period
    await vi.advanceTimersByTimeAsync(0);
    await expectExpired(instance);
    await vi.advanceTimersByTimeAsync(2_000);
    push(primed);
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.getDatafile()).metrics.cacheStatus).toBe('HIT');
    writer.close();
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.evaluate('feature')).value).toBe(true);
    await vi.advanceTimersByTimeAsync(21);
    await expectExpired(instance);
    expect(errors).not.toHaveBeenCalled();
  });

  it('starts grace on failed stream initialization without retrying on reads', async () => {
    network.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const instance = client({
      vercel: false,
      datafile: { ...data(), fetchedAt: undefined },
      staleIfErrorMs: 20,
    });
    expect((await instance.evaluate('feature')).value).toBe(true);
    vi.setSystemTime(NOW + 21);
    await expectExpired(instance);
    expect(network).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it('shares initial polling across concurrent public reads even with SWR disabled', async () => {
    const pending = deferred<Response>();
    network.mockReturnValueOnce(pending.promise);
    const instance = client({
      vercel: false,
      stream: false,
      staleWhileRevalidateMs: 0,
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BundledDefinitions,
  type CreateClientOptions,
  createClient,
  type FlagsClient,
} from './index.default';
import { readBundledDefinitions } from './utils/read-bundled-definitions';

vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(),
}));
vi.mock('./lib/report-value', () => ({ internalReportValue: vi.fn() }));

function data(overrides: Partial<BundledDefinitions> = {}): BundledDefinitions {
  return {
    definitions: {
      flagA: { environments: { production: 1 }, variants: [false, true] },
    },
    segments: {},
    environment: 'production',
    projectId: 'prj_123',
    configUpdatedAt: 10,
    revision: 1,
    digest: 'test',
    ...overrides,
  };
}

// Custom fetch supports exceptional version values without JSON coercion.
function response(value: BundledDefinitions): Response {
  const result = new Response();
  result.json = async () => value;
  return result;
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

const poll = vi.fn<() => Promise<Response>>();
const fetchMock = vi.fn<typeof fetch>();
let clients: FlagsClient[];
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

function client(options: CreateClientOptions = {}): FlagsClient {
  const result = createClient('vf_server_fake', {
    buildStep: false,
    stream: false,
    polling: { intervalMs: 30_000, initTimeoutMs: 3_000 },
    fetch: fetchMock,
    disableMetrics: true,
    ...options,
  });
  clients.push(result);
  return result;
}

function rejectPollOnce(error: Error) {
  for (let attempt = 0; attempt < 3; attempt++) {
    poll.mockRejectedValueOnce(error);
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  clients = [];
  poll.mockReset().mockImplementation(async () => response(data()));
  fetchMock.mockReset().mockImplementation((input) => {
    if (String(input).endsWith('/v1/datafile')) return poll();
    return Promise.resolve(new Response());
  });
  vi.mocked(readBundledDefinitions).mockReset().mockResolvedValue({
    definitions: null,
    state: 'missing-file',
  });
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  try {
    for (const instance of clients) await instance.shutdown();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

describe('polling stale-if-error through the public API', () => {
  it.each([
    -1,
    NaN,
    -Infinity,
  ])('rejects invalid duration %s', (staleIfError) => {
    expect(() => client({ staleIfError })).toThrow(
      '@vercel/flags-core: staleIfError must be a nonnegative number of seconds or Infinity.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    Infinity,
  ])('keeps unlimited fallback for %s', async (staleIfError) => {
    const instance = client({ staleIfError });
    const initial = await instance.evaluate('flagA');
    const failure = new Error('offline');
    poll.mockRejectedValue(failure);
    await vi.advanceTimersByTimeAsync(90_300);
    expect(await instance.evaluate('flagA')).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'STALE' },
    });
    expect(poll).toHaveBeenCalledTimes(10);
  });

  it('includes the finite deadline, preserves the first error, and uses existing error/default/bulk conventions', async () => {
    const instance = client({ staleIfError: 30 });
    const initial = await instance.evaluate('flagA');
    expect(initial.metrics).toEqual({
      readMs: 0,
      evaluationMs: 0,
      source: 'in-memory',
      cacheStatus: 'HIT',
      connectionState: 'disconnected',
      mode: 'polling',
    });
    const snapshot = await instance.getDatafile();
    const first = new Error('first failure');
    const repeated = new Error('repeated failure');
    rejectPollOnce(first);
    poll.mockRejectedValue(repeated);
    await vi.advanceTimersByTimeAsync(30_300);
    expect(await instance.evaluate('flagA')).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'STALE' },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await instance.evaluate('flagA')).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'STALE' },
    });
    await vi.advanceTimersByTimeAsync(1);
    await expect(instance.evaluate('flagA')).rejects.toBe(first);
    const fallback = {
      value: false,
      variantId: null,
      reason: 'error',
      errorMessage: first.message,
    };
    expect(await instance.evaluate('flagA', false)).toEqual(fallback);
    expect(
      await instance.bulkEvaluate([
        { key: 'flagA', defaultValue: false },
        { key: 'missing' },
      ]),
    ).toEqual({
      flagA: fallback,
      missing: { ...fallback, value: undefined },
    });
    await expect(instance.getDatafile()).rejects.toBe(first);
    expect(poll).toHaveBeenCalledTimes(7);
    poll.mockResolvedValueOnce(response(data()));
    await vi.advanceTimersByTimeAsync(29_699);
    const retained = await instance.getDatafile();
    expect(retained).toEqual(snapshot);
    expect(retained.definitions).toBe(snapshot.definitions);
    expect(poll).toHaveBeenCalledTimes(8);
  });

  it('does not expire healthy data between polls or start a poll from reads', async () => {
    const instance = client({ staleIfError: 0.001 });
    const initial = await instance.evaluate('flagA');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(await instance.evaluate('flagA')).toEqual(initial);
    expect(await instance.evaluate('flagA')).toEqual(initial);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await instance.evaluate('flagA')).toEqual(initial);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('allows the polling fetch deadline before becoming stale and resets age on an equal response', async () => {
    const instance = client({
      polling: { intervalMs: 45_000, initTimeoutMs: 3_000 },
    });
    const initial = await instance.evaluate('flagA');
    const snapshot = await instance.getDatafile();
    const pending = deferred<Response>();
    poll.mockReturnValueOnce(pending.promise);

    await vi.advanceTimersByTimeAsync(45_000);
    expect(await instance.evaluate('flagA')).toEqual(initial);
    expect((await instance.getDatafile()).metrics.cacheStatus).toBe('HIT');
    vi.setSystemTime(55_001);
    expect(await instance.evaluate('flagA')).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'STALE' },
    });
    expect((await instance.getDatafile()).metrics.cacheStatus).toBe('STALE');
    expect(poll).toHaveBeenCalledTimes(2);

    pending.resolve(response(data()));
    await vi.advanceTimersByTimeAsync(0);
    expect(await instance.evaluate('flagA')).toEqual(initial);
    const confirmed = await instance.getDatafile();
    expect(confirmed).toEqual(snapshot);
    expect(confirmed.definitions).toBe(snapshot.definitions);
    expect(confirmed.fetchedAt).toBe(0);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('tracks %s freshness through equal polls without replacing the snapshot or changing lifecycle', async (seed) => {
    vi.setSystemTime(100_000);
    const supplied = Object.freeze(data({ fetchedAt: 1_000 }));
    if (seed === 'bundled') {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: supplied,
        state: 'ok',
      });
    }
    const instance = client({
      polling: { intervalMs: 45_000, initTimeoutMs: 3_000 },
      ...(seed === 'provided' ? { datafile: supplied } : {}),
    });
    const initial = await instance.evaluate('flagA');
    expect(initial.metrics).toEqual({
      readMs: 0,
      evaluationMs: 0,
      source: seed === 'provided' ? 'in-memory' : 'embedded',
      cacheStatus: 'HIT',
      connectionState: 'disconnected',
      mode: 'polling',
    });
    const snapshot = await instance.getDatafile();
    expect(snapshot.fetchedAt).toBe(1_000);
    expect(snapshot.definitions).toBe(supplied.definitions);
    expect(snapshot.metrics.cacheStatus).toBe('HIT');
    expect(poll).toHaveBeenCalledTimes(1);
    const pending = deferred<Response>();
    poll.mockReturnValueOnce(pending.promise);

    await vi.advanceTimersByTimeAsync(44_999);
    expect(await instance.evaluate('flagA')).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'HIT' },
    });
    expect(await instance.getDatafile()).toEqual(snapshot);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await instance.evaluate('flagA')).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'HIT' },
    });
    expect(await instance.getDatafile()).toEqual(snapshot);
    expect(poll).toHaveBeenCalledTimes(2);
    vi.setSystemTime(155_001);
    expect(await instance.evaluate('flagA')).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'STALE' },
    });
    expect(await instance.getDatafile()).toEqual({
      ...snapshot,
      metrics: { ...snapshot.metrics, cacheStatus: 'STALE' },
    });
    expect(poll).toHaveBeenCalledTimes(2);

    pending.resolve(response(data()));
    await vi.advanceTimersByTimeAsync(0);
    expect(await instance.evaluate('flagA')).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'HIT' },
    });
    const confirmed = await instance.getDatafile();
    expect(confirmed).toEqual(snapshot);
    expect(confirmed.definitions).toBe(supplied.definitions);
    expect(confirmed.segments).toBe(supplied.segments);
    expect(confirmed.fetchedAt).toBe(1_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it.each([
    { configUpdatedAt: 9 },
    { projectId: 'other' },
    { environment: 'preview' },
  ])('renews polling freshness for a rejected response %j without replacing the snapshot', async (override) => {
    const instance = client({
      polling: { intervalMs: 45_000, initTimeoutMs: 3_000 },
    });
    await instance.evaluate('flagA');
    const snapshot = await instance.getDatafile();
    poll.mockResolvedValueOnce(response(data(override)));
    await vi.advanceTimersByTimeAsync(55_001);
    // The response at 45s proves the source is reachable even though its data is rejected.
    expect((await instance.evaluate('flagA')).metrics?.cacheStatus).toBe('HIT');
    expect(await instance.getDatafile()).toEqual(snapshot);
    expect((await instance.getDatafile()).definitions).toBe(
      snapshot.definitions,
    );
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('accepts fractional seconds and expires just after the inclusive millisecond deadline', async () => {
    const instance = client({ staleIfError: 0.25 });
    const initial = await instance.evaluate('flagA');
    const failure = new Error('offline');
    rejectPollOnce(failure);
    await vi.advanceTimersByTimeAsync(30_300);
    await vi.advanceTimersByTimeAsync(249);
    expect(await instance.evaluate('flagA')).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'STALE' },
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(await instance.evaluate('flagA')).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'STALE' },
    });
    await vi.advanceTimersByTimeAsync(1);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    await expect(instance.getDatafile()).rejects.toBe(failure);
    expect(poll).toHaveBeenCalledTimes(4);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('blocks %s seeds immediately with zero and permits equal-version recovery without replacement', async (seed) => {
    const supplied = data();
    if (seed === 'bundled') {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: supplied,
        state: 'ok',
      });
    }
    const failure = new Error('initial failure');
    rejectPollOnce(failure);
    const instance = client({
      staleIfError: 0,
      ...(seed === 'provided' ? { datafile: supplied } : {}),
    });
    // A snapshot never starts polling; it serves the seed before any failure exists.
    const snapshotRead = instance.getDatafile();
    const evaluation = instance.evaluate('flagA');
    const evaluationOutcome = expect(evaluation).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(301);
    await evaluationOutcome;
    await expect(instance.getDatafile()).rejects.toBe(failure);
    expect(Date.now()).toBe(301);
    expect((await snapshotRead).definitions).toBe(supplied.definitions);
    await vi.advanceTimersByTimeAsync(30_000);
    const snapshot = await instance.getDatafile();
    expect(snapshot.definitions).toBe(supplied.definitions);
    expect(snapshot.metrics.source).toBe(
      seed === 'provided' ? 'in-memory' : 'embedded',
    );
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expect((await instance.getDatafile()).definitions).toBe(
      snapshot.definitions,
    );
    expect(poll).toHaveBeenCalledTimes(4);
  });

  it.each([
    10,
    '10',
    11,
    undefined,
    'invalid',
  ])('recovers on accepted or confirmed version %s and starts a second outage', async (version) => {
    const instance = client({ staleIfError: 0.1 });
    await instance.evaluate('flagA');
    const snapshot = await instance.getDatafile();
    const failure = new Error('offline');
    poll.mockRejectedValue(failure);
    await vi.advanceTimersByTimeAsync(30_401);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    const updated = data({ configUpdatedAt: version as number });
    poll.mockResolvedValueOnce(response(updated));
    await vi.advanceTimersByTimeAsync(29_599);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    const recovered = await instance.getDatafile();
    expect(recovered.definitions).toBe(
      version === 10 || version === '10'
        ? snapshot.definitions
        : updated.definitions,
    );
    await vi.advanceTimersByTimeAsync(30_400);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    expect(poll).toHaveBeenCalledTimes(8);
  });

  it('recovers when polling reuses the same bundled object without changing its embedded origin', async () => {
    const supplied = data();
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      definitions: supplied,
      state: 'ok',
    });
    const instance = client({ staleIfError: 0 });
    const initial = await instance.evaluate('flagA');
    expect(initial.value).toBe(true);
    expect(initial.metrics).toEqual({
      readMs: 0,
      evaluationMs: 0,
      source: 'embedded',
      cacheStatus: 'HIT',
      connectionState: 'disconnected',
      mode: 'polling',
    });
    const snapshot = await instance.getDatafile();
    expect(snapshot.definitions).toBe(supplied.definitions);
    expect(snapshot.metrics.source).toBe('embedded');
    const failure = new Error('polling outage');
    rejectPollOnce(failure);
    await vi.advanceTimersByTimeAsync(30_300);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);

    // Return the exact bundled object, including the origin attached at startup.
    poll.mockResolvedValueOnce(response(supplied));
    await vi.advanceTimersByTimeAsync(29_700);
    const recovered = await instance.evaluate('flagA');
    expect(recovered).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'HIT' },
    });
    const retained = await instance.getDatafile();
    expect(retained).toEqual(snapshot);
    expect(retained.definitions).toBe(supplied.definitions);
    expect(retained.segments).toBe(supplied.segments);
    expect(poll).toHaveBeenCalledTimes(5);
  });

  it.each([
    { configUpdatedAt: 9 },
    { projectId: 'other' },
    { environment: 'preview' },
    { configUpdatedAt: NaN },
    { configUpdatedAt: -Infinity },
  ])('recovers on rejected data %j without replacing the snapshot', async (override) => {
    const instance = client({ staleIfError: 0 });
    await instance.evaluate('flagA');
    const snapshot = await instance.getDatafile();
    const failure = new Error('offline');
    rejectPollOnce(failure);
    poll.mockResolvedValue(response(data(override)));
    await vi.advanceTimersByTimeAsync(30_300);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    await expect(instance.getDatafile()).rejects.toBe(failure);
    expect(poll).toHaveBeenCalledTimes(4);
    // The next poll returns data the version guard rejects; the source is back anyway.
    await vi.advanceTimersByTimeAsync(29_700);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    const recovered = await instance.getDatafile();
    expect(recovered).toEqual(snapshot);
    expect(recovered.definitions).toBe(snapshot.definitions);
    expect(poll).toHaveBeenCalledTimes(5);
  });

  it.each([
    NaN,
    Infinity,
    -Infinity,
  ])('recovers on an equal nonfinite version %s', async (configUpdatedAt) => {
    poll.mockResolvedValue(response(data({ configUpdatedAt })));
    const instance = client({ staleIfError: 0 });
    await instance.evaluate('flagA');
    const failure = new Error('offline');
    rejectPollOnce(failure);
    await vi.advanceTimersByTimeAsync(30_300);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(29_700);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expect(poll).toHaveBeenCalledTimes(5);
  });

  it('retains main acceptance of a newer mismatched identity and positive Infinity', async () => {
    const instance = client({ staleIfError: 0 });
    await instance.evaluate('flagA');
    const failure = new Error('offline');
    rejectPollOnce(failure);
    const accepted = data({ configUpdatedAt: Infinity, projectId: 'other' });
    poll.mockResolvedValue(response(accepted));
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expect((await instance.getDatafile()).definitions).toBe(
      accepted.definitions,
    );
  });

  it('serves startup fallback at initTimeoutMs without treating the timeout as a failure', async () => {
    const pending = deferred<Response>();
    poll.mockReturnValue(pending.promise);
    const instance = client({ staleIfError: 0, datafile: data() });
    const evaluation = instance.evaluate('flagA');
    const settled = vi.fn();
    void evaluation.then(settled, settled);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect((await evaluation).value).toBe(true);
    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(
      '@vercel/flags-core: Polling initialization timeout, falling back while continuing to poll in the background',
    );
    warnSpy.mockClear();
    // Cached reads do not start their own refresh while the first poll is pending.
    await vi.advanceTimersByTimeAsync(6_999);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await expect(instance.evaluate('flagA')).rejects.toThrow(
      '@vercel/flags-core: Datafile fetch deadline exceeded',
    );
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('starts a clean allowance after shutdown and reinitialization with a %s seed', async (seed) => {
    const supplied = data();
    if (seed === 'bundled') {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: supplied,
        state: 'ok',
      });
    }
    const failure = new Error('initial failure');
    poll.mockRejectedValue(failure);
    const instance = client({
      staleIfError: 0.1,
      ...(seed === 'provided' ? { datafile: supplied } : {}),
    });
    const initial = instance.evaluate('flagA');
    await vi.advanceTimersByTimeAsync(300);
    expect((await initial).value).toBe(true);
    await vi.advanceTimersByTimeAsync(101);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    await instance.shutdown();

    // Reinitialization rewires the sources and clears the previous deadline.
    poll.mockResolvedValue(response(supplied));
    expect(await instance.evaluate('flagA')).toMatchObject({
      value: true,
      metrics: { mode: 'polling', cacheStatus: 'HIT' },
    });
    const restored = await instance.getDatafile();
    expect(restored.definitions).toBe(supplied.definitions);
    expect(restored.metrics.source).toBe(
      seed === 'provided' ? 'in-memory' : 'embedded',
    );
    expect(poll).toHaveBeenCalledTimes(4);
  });

  it('settles a timed-out poll before the next interval can recover', async () => {
    const instance = client({ staleIfError: 0 });
    await instance.evaluate('flagA');
    const delayedBody = deferred<BundledDefinitions>();
    const delayedResponse = new Response();
    delayedResponse.json = () => delayedBody.promise;
    poll.mockResolvedValueOnce(delayedResponse);
    await vi.advanceTimersByTimeAsync(40_000);
    await expect(instance.evaluate('flagA')).rejects.toThrow(
      '@vercel/flags-core: Datafile fetch deadline exceeded',
    );

    // Completing the abandoned response cannot overwrite the timeout.
    delayedBody.resolve(data());
    await vi.advanceTimersByTimeAsync(0);
    await expect(instance.evaluate('flagA')).rejects.toThrow(
      '@vercel/flags-core: Datafile fetch deadline exceeded',
    );

    await vi.advanceTimersByTimeAsync(20_000);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it('keeps healthy streaming data with zero even when polling is configured', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify({ type: 'datafile', data: data() })}\n`,
          ),
        );
      },
    });
    fetchMock
      .mockResolvedValueOnce(new Response(body))
      .mockImplementation((input) => {
        if (String(input).endsWith('/v1/datafile')) return poll();
        return Promise.resolve(new Response());
      });
    const instance = client({ stream: true, staleIfError: 0 });
    const initial = await instance.evaluate('flagA');
    expect(initial.metrics?.mode).toBe('streaming');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await instance.evaluate('flagA')).toEqual({
      ...initial,
      metrics: { ...initial.metrics, cacheStatus: 'HIT' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(poll).not.toHaveBeenCalled();
  });

  it('applies zero allowance to an initial stream error through the shared fallback', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const instance = client({
      stream: true,
      datafile: data(),
      staleIfError: 0,
    });
    await expect(instance.evaluate('flagA')).rejects.toThrow(
      'stream: unauthorized (401)',
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(instance.evaluate('flagA')).rejects.toThrow(
      'stream: unauthorized (401)',
    );
    await expect(instance.getDatafile()).rejects.toThrow(
      'stream: unauthorized (401)',
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(poll).not.toHaveBeenCalled();
  });

  it.each([
    true,
    false,
  ])('retains build/offline serving with zero (buildStep=%s)', async (buildStep) => {
    const instance = client({
      buildStep,
      polling: false,
      staleIfError: 0,
      datafile: data(),
    });
    expect((await instance.evaluate('flagA')).value).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

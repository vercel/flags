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

function expectErrors(...errors: Error[]) {
  expect(errorSpy.mock.calls).toEqual(
    errors.map((error) => ['@vercel/flags-core: Poll failed:', error]),
  );
  errorSpy.mockClear();
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
    await vi.advanceTimersByTimeAsync(90_000);
    expect(await instance.evaluate('flagA')).toEqual(initial);
    expect(poll).toHaveBeenCalledTimes(4);
    expectErrors(failure, failure, failure);
  });

  it('includes the finite deadline, preserves the first error, and uses existing error/default/bulk conventions', async () => {
    const instance = client({ staleIfError: 30 });
    const initial = await instance.evaluate('flagA');
    expect(initial.metrics).toEqual({
      readMs: 0,
      evaluationMs: 0,
      source: 'in-memory',
      cacheStatus: 'STALE',
      connectionState: 'disconnected',
      mode: 'polling',
    });
    const snapshot = await instance.getDatafile();
    const first = new Error('first failure');
    const repeated = new Error('repeated failure');
    poll.mockRejectedValueOnce(first).mockRejectedValue(repeated);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await instance.evaluate('flagA')).toEqual(initial);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await instance.evaluate('flagA')).toEqual(initial);
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
    expect(poll).toHaveBeenCalledTimes(3);
    poll.mockResolvedValueOnce(response(data()));
    await vi.advanceTimersByTimeAsync(29_999);
    const retained = await instance.getDatafile();
    expect(retained).toEqual(snapshot);
    expect(retained.definitions).toBe(snapshot.definitions);
    expect(poll).toHaveBeenCalledTimes(4);
    expectErrors(first, repeated);
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

  it('accepts fractional seconds and expires just after the inclusive millisecond deadline', async () => {
    const instance = client({ staleIfError: 0.25 });
    const initial = await instance.evaluate('flagA');
    const failure = new Error('offline');
    poll.mockRejectedValueOnce(failure);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(249);
    expect(await instance.evaluate('flagA')).toEqual(initial);
    await vi.advanceTimersByTimeAsync(1);
    expect(await instance.evaluate('flagA')).toEqual(initial);
    await vi.advanceTimersByTimeAsync(1);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    await expect(instance.getDatafile()).rejects.toBe(failure);
    expect(poll).toHaveBeenCalledTimes(2);
    expectErrors(failure);
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
    poll.mockRejectedValueOnce(failure);
    const instance = client({
      staleIfError: 0,
      ...(seed === 'provided' ? { datafile: supplied } : {}),
    });
    const snapshot = await instance.getDatafile();
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    await expect(instance.getDatafile()).rejects.toBe(failure);
    expect(Date.now()).toBe(0);
    expect(snapshot.definitions).toBe(supplied.definitions);
    expect(snapshot.metrics.source).toBe(
      seed === 'provided' ? 'in-memory' : 'embedded',
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expect((await instance.getDatafile()).definitions).toBe(
      snapshot.definitions,
    );
    expect(poll).toHaveBeenCalledTimes(2);
    expectErrors(failure);
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
    await vi.advanceTimersByTimeAsync(30_101);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    const updated = data({ configUpdatedAt: version as number });
    poll.mockResolvedValueOnce(response(updated));
    await vi.advanceTimersByTimeAsync(29_899);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    const recovered = await instance.getDatafile();
    expect(recovered.definitions).toBe(
      version === 10 || version === '10'
        ? snapshot.definitions
        : updated.definitions,
    );
    await vi.advanceTimersByTimeAsync(30_100);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    expect(poll).toHaveBeenCalledTimes(4);
    expectErrors(failure, failure);
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
      cacheStatus: 'STALE',
      connectionState: 'disconnected',
      mode: 'offline', // Bundled initialization retains the existing lifecycle state.
    });
    const snapshot = await instance.getDatafile();
    expect(snapshot.definitions).toBe(supplied.definitions);
    expect(snapshot.metrics.source).toBe('embedded');
    const failure = new Error('polling outage');
    poll.mockRejectedValueOnce(failure);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);

    // Return the exact bundled object, including the origin attached at startup.
    poll.mockResolvedValueOnce(response(supplied));
    await vi.advanceTimersByTimeAsync(30_000);
    const recovered = await instance.evaluate('flagA');
    expect(recovered).toEqual(initial);
    const retained = await instance.getDatafile();
    expect(retained).toEqual(snapshot);
    expect(retained.definitions).toBe(supplied.definitions);
    expect(retained.segments).toBe(supplied.segments);
    expect(poll).toHaveBeenCalledTimes(3);
    expectErrors(failure);
  });

  it.each([
    { configUpdatedAt: 9 },
    { projectId: 'other' },
    { environment: 'preview' },
    { configUpdatedAt: NaN },
    { configUpdatedAt: -Infinity },
  ])('does not confirm rejected data %j', async (override) => {
    const instance = client({ staleIfError: 0 });
    await instance.evaluate('flagA');
    const snapshot = await instance.getDatafile();
    const failure = new Error('offline');
    poll
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(response(data(override)));
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    await expect(instance.getDatafile()).rejects.toBe(failure);
    expect(poll).toHaveBeenCalledTimes(3);
    poll.mockResolvedValueOnce(response(data()));
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await instance.getDatafile()).definitions).toBe(
      snapshot.definitions,
    );
    expect(poll).toHaveBeenCalledTimes(4);
    expectErrors(failure);
  });

  it.each([
    NaN,
    Infinity,
    -Infinity,
  ])('does not confirm equal nonfinite version %s', async (configUpdatedAt) => {
    poll.mockResolvedValue(response(data({ configUpdatedAt })));
    const instance = client({ staleIfError: 0 });
    await instance.evaluate('flagA');
    const failure = new Error('offline');
    poll.mockRejectedValueOnce(failure);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    expectErrors(failure);
  });

  it('retains main acceptance of a newer mismatched identity and positive Infinity', async () => {
    const instance = client({ staleIfError: 0 });
    await instance.evaluate('flagA');
    const failure = new Error('offline');
    poll.mockRejectedValueOnce(failure);
    const accepted = data({ configUpdatedAt: Infinity, projectId: 'other' });
    poll.mockResolvedValue(response(accepted));
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    expect((await instance.getDatafile()).definitions).toBe(
      accepted.definitions,
    );
    expectErrors(failure);
  });

  it('does not start SIE at initialization timeout; a late actual error does', async () => {
    const pending = deferred<Response>();
    poll.mockReturnValue(pending.promise);
    const instance = client({ staleIfError: 0, datafile: data() });
    const evaluation = instance.evaluate('flagA');
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await evaluation).value).toBe(true);
    expect(warnSpy.mock.calls).toEqual([
      [
        '@vercel/flags-core: Polling initialization timeout, falling back while continuing to poll in the background',
      ],
    ]);
    warnSpy.mockClear();
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    const failure = new Error('late failure');
    pending.reject(failure);
    await vi.advanceTimersByTimeAsync(0);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(1); // Main starts no interval after this timeout.
    expectErrors(failure);
  });

  it.each([
    'provided',
    'bundled',
  ] as const)('does not renew an expired allowance when restoring a %s seed', async (seed) => {
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
    expect((await instance.evaluate('flagA')).value).toBe(true);
    await vi.advanceTimersByTimeAsync(101);
    await instance.shutdown();
    // Main permits reinitialization but does not rewire source events.
    // Restoring a seed must not turn that limitation into a policy bypass.
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    await expect(instance.getDatafile()).rejects.toBe(failure);
    expect(poll).toHaveBeenCalledTimes(2);
    expectErrors(failure);
  });

  it('observes overlapping polls in completion order without coalescing', async () => {
    const instance = client({ staleIfError: 0 });
    await instance.evaluate('flagA');
    const delayedBody = deferred<BundledDefinitions>();
    const delayedResponse = new Response();
    delayedResponse.json = () => delayedBody.promise;
    poll.mockResolvedValueOnce(delayedResponse);
    await vi.advanceTimersByTimeAsync(30_000);
    const failure = new Error('outage');
    poll.mockRejectedValueOnce(failure);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(instance.evaluate('flagA')).rejects.toBe(failure);
    // An older request confirms the current version after the newer error.
    delayedBody.resolve(data());
    await vi.advanceTimersByTimeAsync(0);
    expect((await instance.evaluate('flagA')).value).toBe(true);

    const lateError = deferred<BundledDefinitions>();
    const lateResponse = new Response();
    lateResponse.json = () => lateError.promise;
    poll.mockResolvedValueOnce(lateResponse);
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await instance.evaluate('flagA')).value).toBe(true);
    const secondFailure = new Error('late outage');
    lateError.reject(secondFailure);
    await vi.advanceTimersByTimeAsync(0);
    await expect(instance.evaluate('flagA')).rejects.toBe(secondFailure);
    expect(poll).toHaveBeenCalledTimes(5);
    expectErrors(failure, secondFailure);
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
    fetchMock.mockResolvedValue(new Response(body));
    const instance = client({ stream: true, staleIfError: 0 });
    const initial = await instance.evaluate('flagA');
    expect(initial.metrics?.mode).toBe('streaming');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await instance.evaluate('flagA')).toEqual(initial);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(poll).not.toHaveBeenCalled();
  });

  it('applies zero allowance to an initial stream error without starting polling', async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

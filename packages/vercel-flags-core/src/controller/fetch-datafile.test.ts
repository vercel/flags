import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { version } from '../../package.json';
import type { BundledDefinitions } from '../types';
import { fetchDatafile } from './fetch-datafile';

const data: BundledDefinitions = {
  projectId: 'prj_test',
  environment: 'production',
  definitions: {},
  configUpdatedAt: 1_700_000_000_000,
  revision: 1,
  digest: 'digest',
};
const transport = vi.fn<typeof fetch>();
const resolveToken = vi.fn<() => Promise<string>>();
const options = {
  host: 'https://flags.example.com',
  auth: {
    resolveToken,
    resolveBundledDefinitionsLookup: async () => ({
      type: 'project-id' as const,
      projectId: 'prj_test',
    }),
  },
  fetch: transport,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('VERCEL_ENV', 'production');
  resolveToken.mockReset().mockResolvedValue('vf_test');
  transport.mockReset().mockImplementation(async () => Response.json(data));
});

afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('fetchDatafile', () => {
  it.each([
    'production',
    '',
  ])('preserves request headers for VERCEL_ENV=%s', async (env) => {
    vi.stubEnv('VERCEL_ENV', env);
    const abort = new AbortController();
    const removeListener = vi.spyOn(abort.signal, 'removeEventListener');

    await expect(
      fetchDatafile({ ...options, signal: abort.signal }),
    ).resolves.toEqual(data);
    expect(transport).toHaveBeenCalledExactlyOnceWith(
      `${options.host}/v1/datafile`,
      {
        headers: {
          Authorization: 'Bearer vf_test',
          'User-Agent': `VercelFlagsCore/${version}`,
          ...(env ? { 'X-Vercel-Env': env } : {}),
        },
        signal: expect.any(AbortSignal),
      },
    );
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    abort.abort();
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
  });

  it('retries network and HTTP failures after 100ms and 200ms', async () => {
    transport
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));
    const result = fetchDatafile(options);

    await vi.advanceTimersByTimeAsync(99);
    expect(transport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(transport).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(transport).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual(data);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it.each([
    'authentication',
    'body parsing',
  ])('retries a failed %s attempt', async (phase) => {
    const failure = new Error('Temporary failure');
    if (phase === 'authentication') resolveToken.mockRejectedValueOnce(failure);
    else {
      const response = Response.json(data);
      vi.spyOn(response, 'json').mockRejectedValueOnce(failure);
      transport.mockResolvedValueOnce(response);
    }
    const result = fetchDatafile({ ...options, maxAttempts: 3 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toEqual(data);
    expect(resolveToken).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenCalledTimes(phase === 'authentication' ? 1 : 2);
  });

  it('stops after three attempts and preserves the final error', async () => {
    const failure = new Error('Last failure');
    transport.mockRejectedValue(failure);
    const result = fetchDatafile(options).catch((error) => error);
    await vi.advanceTimersByTimeAsync(300);

    expect(await result).toBe(failure);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('allows callers to disable retries', async () => {
    transport.mockResolvedValueOnce(
      new Response(null, {
        status: 503,
        statusText: 'Service Unavailable',
      }),
    );
    await expect(fetchDatafile({ ...options, maxAttempts: 1 })).rejects.toThrow(
      'Failed to fetch data: Service Unavailable',
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    408, 429, 500, 502, 503, 504,
  ])('retries HTTP %i responses', async (status) => {
    transport.mockResolvedValueOnce(new Response(null, { status }));
    const result = fetchDatafile(options);
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toEqual(data);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([
    400, 401, 403, 404, 422,
  ])('does not retry permanent HTTP %i failures', async (status) => {
    transport.mockResolvedValueOnce(
      new Response(null, { status, statusText: 'Client error' }),
    );
    await expect(fetchDatafile(options)).rejects.toThrow(
      'Failed to fetch data: Client error',
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
  ])('rejects invalid maxAttempts=%s', async (maxAttempts) => {
    await expect(fetchDatafile({ ...options, maxAttempts })).rejects.toThrow(
      'maxAttempts must be a positive integer',
    );
    expect(resolveToken).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it('does no authentication or I/O for an already aborted signal', async () => {
    const reason = new Error('Stopped');
    await expect(
      fetchDatafile({ ...options, signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
    expect(resolveToken).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  describe.each(['deadline', 'external abort'])('%s', (cause) => {
    it.each([
      'authentication',
      'fetch',
      'body parsing',
    ])('settles pending %s and ignores its late result', async (phase) => {
      const token = deferred<string>();
      const response = deferred<Response>();
      const body = deferred<BundledDefinitions>();
      const resolvedResponse = Response.json(data);
      const parse = vi.spyOn(resolvedResponse, 'json');
      if (phase === 'authentication')
        resolveToken.mockReturnValueOnce(token.promise);
      if (phase === 'fetch') transport.mockReturnValueOnce(response.promise);
      if (phase === 'body parsing') {
        parse.mockReturnValueOnce(body.promise);
        transport.mockResolvedValueOnce(resolvedResponse);
      }
      const abort = new AbortController();
      const removeListener = vi.spyOn(abort.signal, 'removeEventListener');
      const settled = vi.fn();
      const result = fetchDatafile({
        ...options,
        signal: abort.signal,
        maxAttempts: 3,
      })
        .catch((error) => error)
        .then((error) => {
          settled();
          return error;
        });
      await vi.advanceTimersByTimeAsync(9_999);
      expect(settled).not.toHaveBeenCalled();

      const reason = new Error('Stopped');
      if (cause === 'external abort') abort.abort(reason);
      else await vi.advanceTimersByTimeAsync(1);
      const error = await result;
      if (cause === 'external abort') expect(error).toBe(reason);
      else
        expect(error.message).toBe(
          '@vercel/flags-core: Datafile fetch deadline exceeded',
        );
      if (phase !== 'authentication') {
        expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      }
      expect(removeListener).toHaveBeenCalledWith(
        'abort',
        expect.any(Function),
      );

      token.resolve('late token');
      response.resolve(resolvedResponse);
      body.resolve(data);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(transport).toHaveBeenCalledTimes(
        phase === 'authentication' ? 0 : 1,
      );
      expect(parse).toHaveBeenCalledTimes(phase === 'body parsing' ? 1 : 0);
      expect(settled).toHaveBeenCalledTimes(1);
    });
  });

  it('uses one deadline across attempts and body parsing', async () => {
    const first = deferred<Response>();
    const body = deferred<BundledDefinitions>();
    const second = Response.json(data);
    vi.spyOn(second, 'json').mockReturnValueOnce(body.promise);
    transport.mockReturnValueOnce(first.promise).mockResolvedValueOnce(second);
    const result = fetchDatafile({ ...options, maxAttempts: 3 }).catch(
      (error) => error,
    );
    await vi.advanceTimersByTimeAsync(8_000);
    first.reject(new Error('Retry'));
    await vi.advanceTimersByTimeAsync(100);
    expect(transport).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_900);

    expect(await result).toEqual(
      new Error('@vercel/flags-core: Datafile fetch deadline exceeded'),
    );
    body.resolve(data);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([
    'deadline',
    'external abort',
  ])('cancels the retry delay on %s', async (cause) => {
    const pending = deferred<Response>();
    transport.mockReturnValueOnce(pending.promise);
    const abort = new AbortController();
    const result = fetchDatafile({
      ...options,
      signal: abort.signal,
      maxAttempts: 3,
    }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(9_950);
    pending.reject(new Error('Retry'));
    await vi.advanceTimersByTimeAsync(0);

    if (cause === 'external abort') abort.abort();
    else await vi.advanceTimersByTimeAsync(50);
    expect(await result).toBeInstanceOf(Error);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

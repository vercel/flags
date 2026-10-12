import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, rethrow, setupFramework } from './binding';

const headers = vi.fn();
const cookies = vi.fn();
const connection = vi.fn();
const unstable_rethrow = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => headers(),
  cookies: () => cookies(),
}));
vi.mock('next/server', () => ({
  connection: () => connection(),
}));
vi.mock('next/navigation', () => ({
  unstable_rethrow: (error: unknown) => unstable_rethrow(error),
}));

beforeEach(() => {
  headers.mockReset();
  cookies.mockReset();
  connection.mockReset().mockResolvedValue(undefined);
  unstable_rethrow.mockReset();
});

describe('getRequest', () => {
  it('gives the headers and cookies of Next.js', async () => {
    const requestHeaders = new Headers({ 'x-user': 'alice' });
    const requestCookies = { get: vi.fn(), getAll: vi.fn(), has: vi.fn() };
    headers.mockResolvedValue(requestHeaders);
    cookies.mockResolvedValue(requestCookies);

    await expect(getRequest()).resolves.toEqual({
      headers: requestHeaders,
      cookies: requestCookies,
    });
  });

  it('waits for connection(), so that the evaluation is not prerendered', async () => {
    headers.mockResolvedValue(new Headers());
    cookies.mockResolvedValue({});
    let connect = () => {};
    connection.mockReturnValue(
      new Promise<void>((resolve) => {
        connect = resolve;
      }),
    );

    let done = false;
    const request = getRequest().then(() => {
      done = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done).toBe(false);
    connect();
    await request;
    expect(done).toBe(true);
  });

  it('throws its own error in a cache scope, also for a flag with a default value', async () => {
    const error = new Error(
      'Route / used `headers()` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported.',
    );
    headers.mockImplementation(() => {
      throw error;
    });

    const thrown = await getRequest().catch((e: unknown) => e);
    expect(thrown).toMatchObject({
      name: 'FlagInCacheError',
      message: expect.stringContaining(
        'can not be evaluated inside a cache scope',
      ),
      cause: error,
    });
    // The runtime calls rethrow before it uses the default value
    expect(() => rethrow(thrown)).toThrow(thrown as Error);
    expect(() => rethrow(new Error('other'))).not.toThrow();
  });

  it('gives no request outside of a request', async () => {
    headers.mockRejectedValue(
      new Error('`headers` was called outside a request scope.'),
    );

    await expect(getRequest()).resolves.toBeUndefined();
  });

  it('lets the internal errors of Next.js through', async () => {
    const internal = new Error('DYNAMIC_SERVER_USAGE');
    headers.mockRejectedValue(internal);
    unstable_rethrow.mockImplementation((error: unknown) => {
      throw error;
    });

    await expect(getRequest()).rejects.toBe(internal);
    expect(unstable_rethrow).toHaveBeenCalledWith(internal);
  });
});

describe('setupFramework', () => {
  it('sets the request source, the rethrow and the config source', async () => {
    const runtime = {
      setRequestSource: vi.fn(),
      setRethrow: vi.fn(),
      setConfigSource: vi.fn(),
    };

    await setupFramework(runtime as never);
    expect(runtime.setRequestSource).toHaveBeenCalledWith(getRequest);
    expect(runtime.setRethrow).toHaveBeenCalledTimes(1);
    // Without the plugin, flags/config has no configuration
    const source = runtime.setConfigSource.mock.calls[0]?.[0];
    await expect(source()).resolves.toBeUndefined();
  });
});

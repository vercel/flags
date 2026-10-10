import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, setupIntegration } from './index';

const headers = vi.fn();
const cookies = vi.fn();
const unstable_rethrow = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => headers(),
  cookies: () => cookies(),
}));
vi.mock('next/navigation', () => ({
  unstable_rethrow: (error: unknown) => unstable_rethrow(error),
}));

beforeEach(() => {
  headers.mockReset();
  cookies.mockReset();
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

describe('setupIntegration', () => {
  it('sets the request source, the rethrow and the config source', async () => {
    const runtime = {
      setRequestSource: vi.fn(),
      setRethrow: vi.fn(),
      setConfigSource: vi.fn(),
    };

    await setupIntegration(runtime as never);
    expect(runtime.setRequestSource).toHaveBeenCalledWith(getRequest);
    expect(runtime.setRethrow).toHaveBeenCalledTimes(1);
    // Without the plugin, flags/config has no configuration
    const source = runtime.setConfigSource.mock.calls[0]?.[0];
    await expect(source()).resolves.toBeUndefined();
  });
});

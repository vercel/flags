import { flag } from 'flags';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  binding,
  FlagInCacheError,
  isCacheScopeError,
  isNextSignal,
} from './binding';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: () => undefined })),
  // unstable_rethrow of Next.js: it throws an internal error
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message === 'NEXT_FUTURE_SIGNAL') {
      throw error;
    }
  }),
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
  cookies: mocks.cookies,
}));

vi.mock('next/navigation', () => ({
  unstable_rethrow: mocks.unstable_rethrow,
}));

// The messages of Next.js before and since 16.4.6
const cacheScopeErrors = [
  'Route /shop used `headers()` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported.',
  'Route /shop used `cookies()` inside `"use cache: private"`. Accessing Dynamic data sources inside a cache scope is not supported.',
  'Route /shop used `headers()` inside a function cached with `unstable_cache()`.',
];

afterEach(() => {
  mocks.headers.mockImplementation(async () => new Headers());
});

describe('a flag inside a cache scope', () => {
  it.each(cacheScopeErrors)('throws a clear error for: %s', async (message) => {
    const original = new Error(message);
    mocks.headers.mockImplementation(async () => {
      throw original;
    });
    const summerSale = flag<boolean>({
      key: 'cache-scope-flag',
      defaultValue: false,
      decide: () => true,
    });

    const error = await summerSale().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(FlagInCacheError);
    expect((error as Error).message).toBe(
      'flags: A flag can not be evaluated inside a cache scope, e.g. "use cache", because a flag value must not be cached. Evaluate the flag outside of the cached function, and pass the value in as an argument.',
    );
    // The error of Next.js stays available
    expect((error as Error).cause).toBe(original);
  });

  it('keeps other errors of next/headers as they are', async () => {
    const original = new Error('headers was called outside a request scope');
    mocks.headers.mockImplementation(async () => {
      throw original;
    });

    await expect(binding.getRequest()).rejects.toBe(original);
    await expect(binding.getHeaders()).rejects.toBe(original);
  });

  it('only matches the names of cache scopes', () => {
    expect(isCacheScopeError(new Error(cacheScopeErrors[0]))).toBe(true);
    expect(isCacheScopeError(new Error('use cache'))).toBe(false);
    expect(isCacheScopeError('"use cache"')).toBe(false);
  });
});

describe('the signals of Next.js', () => {
  it('are the internal errors of isInternalNextError', () => {
    expect(isNextSignal({ digest: 'NEXT_REDIRECT;replace;/login' })).toBe(true);
    expect(isNextSignal(new Error('the provider failed'))).toBe(false);
  });

  it('also are the errors which unstable_rethrow throws', () => {
    expect(isNextSignal(new Error('NEXT_FUTURE_SIGNAL'))).toBe(true);
    expect(isNextSignal(new Error('the provider failed'))).toBe(false);
  });

  it('are thrown again by a flag, also with a defaultValue', async () => {
    const failing = flag<boolean>({
      key: 'future-signal-flag',
      defaultValue: false,
      decide: () => {
        throw new Error('NEXT_FUTURE_SIGNAL');
      },
    });

    await expect(failing()).rejects.toThrow('NEXT_FUTURE_SIGNAL');
  });
});

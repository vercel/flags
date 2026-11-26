import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FrameworkBinding, setFramework } from '../lib/framework';
import type { ReadonlyHeaders } from '../spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';
import { dedupe, evaluate, flag } from '.';
import { framework, nextBinding } from './binding';

// With a supplied binding, flags/next must not read next/headers itself
vi.mock('next/headers', () => ({
  headers: () => {
    throw new Error('next/headers must not be read');
  },
  cookies: () => {
    throw new Error('next/headers must not be read');
  },
}));

class SignalError extends Error {}

/** A binding for one request, with the given headers. */
function bindingFor(init: Record<string, string>): FrameworkBinding & {
  headers: ReadonlyHeaders;
} {
  const headers = new Headers(init) as unknown as ReadonlyHeaders;
  const cookies = {
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    size: 0,
  } as unknown as ReadonlyRequestCookies;
  return {
    name: 'test',
    headers,
    getHeaders: vi.fn(async () => headers),
    getRequest: vi.fn(async () => ({ headers, cookies })),
    isFrameworkSignal: (error) => error instanceof SignalError,
  };
}

afterEach(() => {
  setFramework(undefined);
});

describe('the binding of flags/next', () => {
  it('is the binding of Next.js by default', () => {
    expect(framework()).toBe(nextBinding);
  });

  it('is replaced by a supplied binding', () => {
    const binding = bindingFor({});
    setFramework(binding);

    expect(framework()).toBe(binding);
  });

  it('gives flag() the request of the binding', async () => {
    const binding = bindingFor({ 'x-user': 'alice' });
    setFramework(binding);
    const isAlice = flag<boolean>({
      key: 'binding-is-alice',
      decide: ({ headers }) => headers.get('x-user') === 'alice',
    });

    await expect(isAlice()).resolves.toBe(true);
    expect(binding.getRequest).toHaveBeenCalled();
  });

  it('gives evaluate() the request of the binding', async () => {
    setFramework(bindingFor({ 'x-user': 'bob' }));
    const user = flag<string>({
      key: 'binding-user',
      decide: ({ headers }) => headers.get('x-user') ?? 'nobody',
    });

    await expect(evaluate([user])).resolves.toEqual(['bob']);
  });

  it('dedupes by the headers of the binding', async () => {
    const fn = vi.fn((value: number) => value * 2);
    const deduped = dedupe(fn);

    setFramework(bindingFor({}));
    await deduped(2);
    await deduped(2);
    expect(fn).toHaveBeenCalledTimes(1);

    // A new request has new headers
    setFramework(bindingFor({}));
    await deduped(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws a signal of the framework again, also with a defaultValue', async () => {
    setFramework(bindingFor({}));
    const signal = flag<boolean>({
      key: 'binding-signal',
      defaultValue: false,
      decide: () => {
        throw new SignalError('redirect');
      },
    });
    const failing = flag<boolean>({
      key: 'binding-failing',
      defaultValue: false,
      decide: () => {
        throw new Error('the provider failed');
      },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});

    await expect(signal()).rejects.toBeInstanceOf(SignalError);
    // Another error gives the defaultValue, as before
    await expect(failing()).resolves.toBe(false);
  });
});

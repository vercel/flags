import { afterEach, describe, expect, it, vi } from 'vitest';
import { flag, getEvaluatedFlagValues } from './index';
import { type FrameworkBinding, setFramework } from './lib/framework';
import type { ReadonlyHeaders } from './spec-extension/adapters/headers';

/** A binding for one request, with the given headers */
function requestWith(init: HeadersInit): Headers {
  const headers = new Headers(init);
  const binding: FrameworkBinding = {
    name: 'test',
    getHeaders: async () => headers as unknown as ReadonlyHeaders,
    getRequest: async () => ({
      headers: headers as unknown as ReadonlyHeaders,
    }),
    isFrameworkSignal: () => false,
  };
  setFramework(binding);
  return headers;
}

afterEach(() => {
  setFramework(undefined);
});

describe('getEvaluatedFlagValues', () => {
  it('gives the values which the current request evaluated', async () => {
    requestWith({ cookie: 'user=alice' });
    const user = flag<string>({
      key: 'evaluated-user',
      decide: ({ cookies }) => cookies.get('user')?.value ?? 'nobody',
    });
    const sale = flag<boolean>({ key: 'evaluated-sale', decide: () => true });

    await user();
    await sale();

    await expect(getEvaluatedFlagValues()).resolves.toEqual({
      'evaluated-user': 'alice',
      'evaluated-sale': true,
    });
  });

  it('gives the values of a given request, also without a current one', async () => {
    const headers = requestWith({});
    const sale = flag<boolean>({ key: 'given-sale', decide: () => false });
    await sale();

    // e.g. SvelteKit, while it renders the response
    setFramework(undefined);
    await expect(getEvaluatedFlagValues({ headers })).resolves.toEqual({
      'given-sale': false,
    });
  });

  it('is empty for a request which evaluated no flag', async () => {
    requestWith({});

    await expect(getEvaluatedFlagValues()).resolves.toEqual({});
  });

  it('leaves out a flag whose evaluation failed', async () => {
    requestWith({});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = flag<boolean>({
      key: 'evaluated-failing',
      decide: () => {
        throw new Error('the provider failed');
      },
    });
    await expect(failing()).rejects.toThrow('the provider failed');

    await expect(getEvaluatedFlagValues()).resolves.toEqual({});
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { dedupe } from './dedupe';
import { evaluate, getEvaluatedFlagValues } from './evaluate';
import { flag } from './flag';
import { encryptOverrides } from './lib/crypto';
import { createFlagsRequest } from './request';
import { runtime } from './runtime';
import type { FlagParamsType } from './types';

// The framework gives no request: each flag must get it from the runtime
vi.mock('next/headers', () => ({
  headers: vi.fn(() => {
    throw new Error('headers() must not be called');
  }),
  cookies: vi.fn(() => {
    throw new Error('cookies() must not be called');
  }),
}));

const secret = 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc';

function requestWith(headers: Record<string, string> = {}) {
  return new Request('https://shop.example/', { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runtime.onInvoke', () => {
  it('gives the flags the request, also in work which ends later', async () => {
    const host = flag<string>({
      key: 'host',
      decide: ({ headers }) => headers.get('host') ?? 'none',
    });

    const value = await runtime.onInvoke(
      requestWith({ host: 'shop.example' }),
      () => new Promise((resolve) => setTimeout(() => resolve(host()), 0)),
    );

    expect(value).toBe('shop.example');
  });

  it('returns the result of next', async () => {
    await expect(runtime.onInvoke(requestWith(), () => 42)).resolves.toBe(42);
  });

  it('evaluates each flag one time for each request', async () => {
    const decide = vi.fn(() => true);
    const sale = flag<boolean>({ key: 'sale', decide });

    await runtime.onInvoke(requestWith(), async () => {
      await Promise.all([sale(), sale(), evaluate([sale])]);
    });
    await runtime.onInvoke(requestWith(), () => sale());

    expect(decide).toHaveBeenCalledTimes(2);
  });

  it('calls identify with the same argument for all flags of a request', async () => {
    const identify = dedupe(({ cookies }: FlagParamsType) => ({
      user: cookies.get('user')?.value,
    }));
    const spy = vi.fn(identify);
    const a = flag({
      key: 'a',
      identify: spy,
      decide: ({ entities }) => entities?.user === 'ada',
    });
    const b = flag({
      key: 'b',
      identify: spy,
      decide: ({ entities }) => entities?.user === 'ada',
    });

    const values = await runtime.onInvoke(
      requestWith({ cookie: 'user=ada' }),
      () => Promise.all([a(), b()]),
    );

    expect(values).toEqual([true, true]);
    expect(spy.mock.calls[0]?.[0]).toBe(spy.mock.calls[1]?.[0]);
  });

  it('runs a function of dedupe one time for each request', async () => {
    const load = vi.fn(async () => 'data');
    const deduped = dedupe(load);

    await runtime.onInvoke(requestWith(), async () => {
      await deduped();
      await deduped();
    });

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('uses the request which the call passes', async () => {
    const host = flag<string>({
      key: 'passed-host',
      decide: ({ headers }) => headers.get('host') ?? 'none',
    });

    const value = await runtime.onInvoke(requestWith({ host: 'outer' }), () =>
      host(requestWith({ host: 'passed' })),
    );

    expect(value).toBe('passed');
  });

  it('gives a passed request with the same headers the same state', async () => {
    const request = requestWith();
    const sale = flag<boolean>({ key: 'summer-sale', decide: () => true });

    await runtime.onInvoke(request, () => sale());

    // e.g. SvelteKit, which renders the response after the hook
    await expect(getEvaluatedFlagValues(request)).resolves.toEqual({
      'summer-sale': true,
    });
  });

  it('applies the overrides of the request', async () => {
    vi.stubEnv('FLAGS_SECRET', secret);
    const sale = flag<boolean>({ key: 'override-sale', decide: () => false });
    const token = await encryptOverrides({ 'override-sale': true }, secret);

    const value = await runtime.onInvoke(
      requestWith({ cookie: `vercel-flag-overrides=${token}` }),
      () => sale(),
    );

    expect(value).toBe(true);
  });

  it('throws without a request', async () => {
    const sale = flag<boolean>({ key: 'no-request', decide: () => true });

    await expect(sale()).rejects.toThrow('headers() must not be called');
  });
});

describe('createFlagsRequest', () => {
  it('reads the cookies of the Cookie header', () => {
    const request = createFlagsRequest({
      headers: new Headers({ cookie: 'a=1; b=2' }),
    });

    expect(request.cookies.get('b')?.value).toBe('2');
  });

  it('accepts the headers of an IncomingMessage', () => {
    const request = createFlagsRequest({
      headers: { host: 'shop.example', 'x-list': ['1', '2'] },
    });

    expect(request.headers.get('host')).toBe('shop.example');
    expect(request.headers.get('x-list')).toBe('1, 2');
  });

  it('seals the headers', () => {
    const request = createFlagsRequest({ headers: new Headers() });

    expect(() => (request.headers as Headers).set('a', '1')).toThrow();
  });

  it('reads the URL when it is used', () => {
    const request = createFlagsRequest({ url: 'not a url' });

    expect(request.headers.get('host')).toBeNull();
    expect(() => request.url).toThrow(TypeError);
    expect(
      createFlagsRequest({ url: 'https://a.example/x' }).url?.pathname,
    ).toBe('/x');
  });
});

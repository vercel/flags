import { expect, it, describe, vi, beforeAll } from 'vitest';
import { flag, precompute } from '.';
import { IncomingMessage } from 'node:http';
import { NextApiRequestCookies } from 'next/dist/server/api-utils';
import { Readable } from 'node:stream';
import { type Adapter, encrypt } from '..';

const mocks = vi.hoisted(() => {
  return {
    headers: vi.fn(() => new Headers()),
    cookies: vi.fn(() => ({
      get: vi.fn(),
    })),
  };
});

vi.mock('next/headers', async (importOriginal) => {
  const mod = await importOriginal<typeof import('next/headers')>();
  return {
    ...mod,
    // replace some exports
    headers: mocks.headers,
    cookies: mocks.cookies,
  };
});

function createRequest(cookies = {}): [
  IncomingMessage & {
    cookies: NextApiRequestCookies;
  },
  Readable,
] {
  const socket = new Readable();
  const request = new IncomingMessage(socket as any) as IncomingMessage & {
    cookies: NextApiRequestCookies;
  };
  request.cookies = cookies;
  request.headers['cookie'] = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');

  return [request, socket];
}

describe('flag on app router', () => {
  beforeAll(() => {
    // a random secret for testing purposes
    process.env.FLAGS_SECRET = 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc';
  });
  it('allows declaring a flag', async () => {
    mocks.headers.mockReturnValueOnce(new Headers());

    const f = flag<boolean>({
      key: 'first-flag',
      decide: () => false,
    });

    expect(f).toHaveProperty('key', 'first-flag');
    await expect(f()).resolves.toEqual(false);
  });

  it('caches for the duration of a request', async () => {
    let i = 0;
    const decide = vi.fn(() => i++);
    const f = flag<number>({ key: 'first-flag', decide });

    // first request using the flag twice
    const headersOfFirstRequest = new Headers();
    mocks.headers.mockReturnValueOnce(headersOfFirstRequest);
    await expect(f()).resolves.toEqual(0);

    // decide not called here so the cached 0 is returned instead of 1
    mocks.headers.mockReturnValueOnce(headersOfFirstRequest);
    await expect(f()).resolves.toEqual(0);

    expect(decide).toHaveBeenCalledTimes(1);

    // next request using the flag again, gets new value
    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(f()).resolves.toEqual(1);

    // check the value of the first request again, which should still be 0
    mocks.headers.mockReturnValueOnce(headersOfFirstRequest);
    await expect(f()).resolves.toEqual(0);

    expect(decide).toHaveBeenCalledTimes(2);
  });

  it('caches in-flight evaluations for the duration of a request', async () => {
    let resolve: (value: boolean) => void;
    const promise = new Promise<boolean>((r) => {
      resolve = r;
    });

    const mockDecide = vi.fn(() => promise);

    const f = flag<boolean>({
      key: 'first-flag',
      decide: mockDecide,
    });

    // first request
    const headersOfFirstRequest = new Headers();
    mocks.headers.mockReturnValueOnce(headersOfFirstRequest);
    const value1 = f();

    // second evaluation using the flag again, gets the cached value
    mocks.headers.mockReturnValueOnce(headersOfFirstRequest);
    const value2 = f();

    // @ts-expect-error this is defined
    resolve(false);

    await expect(value1).resolves.toEqual(false);
    await expect(value2).resolves.toEqual(false);

    expect(mockDecide).toHaveBeenCalledTimes(1);
  });

  it('respects overrides', async () => {
    const decide = vi.fn(() => false);
    const f = flag<boolean>({ key: 'first-flag', decide });

    // first request using the flag twice
    const headersOfFirstRequest = new Headers();
    const override = await encrypt({ 'first-flag': true });
    const cookieMock = vi.fn((cookieName) => {
      if (cookieName === 'vercel-flag-overrides') {
        return { name: 'vercel-flag-overrides', value: override };
      }
      throw new Error('no cookie found');
    });
    mocks.headers.mockReturnValueOnce(headersOfFirstRequest);
    mocks.cookies.mockReturnValueOnce({ get: cookieMock });
    await expect(f()).resolves.toEqual(true);
    expect(cookieMock).toHaveBeenCalledWith('vercel-flag-overrides');
    expect(decide).not.toHaveBeenCalled();
  });

  it('uses precomputed values', async () => {
    const decide = vi.fn(() => true);
    const f = flag<boolean>({
      key: 'first-flag',
      decide,
      options: [false, true],
    });
    const flagGroup = [f];
    const code = await precompute(flagGroup);
    expect(decide).toHaveBeenCalledTimes(1);
    await expect(f(code, flagGroup)).resolves.toEqual(true);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('uses precomputed values even when options are inferred', async () => {
    const decide = vi.fn(() => true);
    const f = flag<boolean>({ key: 'first-flag', decide });
    const flagGroup = [f];
    const code = await precompute(flagGroup);
    expect(decide).toHaveBeenCalledTimes(1);
    await expect(f(code, flagGroup)).resolves.toEqual(true);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('falls back to the defaultValue if an async decide throws', async () => {
    let rejectPromise: () => void;
    const promise = new Promise<boolean>((resolve, reject) => {
      rejectPromise = reject;
    });

    const mockDecide = vi.fn(() => promise);
    const catchFn = vi.fn();

    const f = flag<boolean>({
      key: 'first-flag',
      decide: mockDecide,
      defaultValue: false,
    });

    // first request
    const headersOfFirstRequest = new Headers();
    mocks.headers.mockReturnValueOnce(headersOfFirstRequest);
    const value1 = f().catch(catchFn);

    // @ts-expect-error this is defined
    rejectPromise(new Error('custom error'));
    await promise.catch(() => {});

    await expect(value1).resolves.toEqual(false);
    expect(catchFn).not.toHaveBeenCalled();
    expect(mockDecide).toHaveBeenCalledTimes(1);
  });

  it('falls back to the defaultValue if a sync decide throws', async () => {
    const mockDecide = vi.fn(() => {
      throw new Error('custom error');
    });

    const f = flag<boolean>({
      key: 'first-flag',
      decide: mockDecide,
      defaultValue: false,
    });

    mocks.headers.mockReturnValueOnce(new Headers());

    await expect(f()).resolves.toEqual(false);
    expect(mockDecide).toHaveBeenCalledTimes(1);
  });

  it('falls back to the defaultValue when a decide function returns undefined', async () => {
    const syncFlag = flag<boolean>({
      key: 'sync-flag',
      // @ts-expect-error this is the case we are testing
      decide: () => undefined,
      defaultValue: true,
    });

    await expect(syncFlag()).resolves.toEqual(true);

    const asyncFlag = flag<boolean>({
      key: 'async-flag',
      // @ts-expect-error this is the case we are testing
      decide: async () => undefined,
      defaultValue: true,
    });

    await expect(asyncFlag()).resolves.toEqual(true);
  });

  it('throws an error when the decide function returns undefined and no defaultValue is provided', async () => {
    const syncFlag = flag<boolean>({
      key: 'sync-flag',
      // @ts-expect-error this is the case we are testing
      decide: () => undefined,
    });

    await expect(syncFlag()).rejects.toThrow(
      '@vercel/flags: Flag "sync-flag" must have a defaultValue or a decide function that returns a value',
    );

    const asyncFlag = flag<string>({
      key: 'async-flag',
      // @ts-expect-error this is the case we are testing
      decide: async () => undefined,
    });

    await expect(asyncFlag()).rejects.toThrow(
      '@vercel/flags: Flag "async-flag" must have a defaultValue or a decide function that returns a value',
    );
  });
});

describe('flag on pages router', () => {
  beforeAll(() => {
    // a random secret for testing purposes
    process.env.FLAGS_SECRET = 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc';
  });

  it('allows declaring a flag', async () => {
    mocks.headers.mockReturnValueOnce(new Headers());

    const f = flag<boolean>({
      key: 'first-flag',
      decide: () => false,
    });

    expect(f).toHaveProperty('key', 'first-flag');

    const [firstRequest, socket1] = createRequest();

    await expect(f(firstRequest)).resolves.toEqual(false);
    socket1.destroy();
  });

  it('caches for the duration of a request', async () => {
    let i = 0;
    const decide = vi.fn(() => i++);
    const f = flag<number>({ key: 'first-flag', decide });

    const [firstRequest, socket1] = createRequest();
    const [secondRequest, socket2] = createRequest();

    await expect(f(firstRequest)).resolves.toEqual(0);

    // decide not called here so the cached 0 is returned instead of 1
    await expect(f(firstRequest)).resolves.toEqual(0);

    expect(decide).toHaveBeenCalledTimes(1);

    // next request using the flag again, gets new value
    await expect(f(secondRequest)).resolves.toEqual(1);

    // check the value of the first request again, which should still be 0
    await expect(f(firstRequest)).resolves.toEqual(0);

    expect(decide).toHaveBeenCalledTimes(2);

    socket1.destroy();
    socket2.destroy();
  });

  it('caches in-flight evaluations for the duration of a request', async () => {
    let resolve: (value: boolean) => void;
    const promise = new Promise<boolean>((r) => {
      resolve = r;
    });

    const mockDecide = vi.fn(() => promise);

    const f = flag<boolean>({
      key: 'first-flag',
      decide: mockDecide,
    });

    // first request
    const [firstRequest, socket1] = createRequest();
    const value1 = f(firstRequest);

    // second evaluation using the flag again, gets the cached value
    const value2 = f(firstRequest);

    // @ts-expect-error this is defined
    resolve(false);

    await expect(value1).resolves.toEqual(false);
    await expect(value2).resolves.toEqual(false);

    expect(mockDecide).toHaveBeenCalledTimes(1);
    socket1.destroy();
  });

  it('should re-throw errors when no defaultValue is provided', async () => {
    const mockDecide = vi.fn(() => {
      throw new Error('custom error');
    });
    const f = flag<boolean>({
      key: 'first-flag',
      decide: mockDecide,
    });

    const [firstRequest, socket1] = createRequest();
    expect(mockDecide).toHaveBeenCalledTimes(0);
    await expect(() => f(firstRequest)).rejects.toThrow('custom error');
    expect(mockDecide).toHaveBeenCalledTimes(1);
    socket1.destroy();
  });

  it('falls back to the defaultValue when a decide function returns undefined', async () => {
    const [firstRequest, socket1] = createRequest();
    const syncFlag = flag<boolean>({
      key: 'sync-flag',
      // @ts-expect-error this is the case we are testing
      decide: () => undefined,
      defaultValue: true,
    });

    await expect(syncFlag(firstRequest)).resolves.toEqual(true);

    const asyncFlag = flag<boolean>({
      key: 'async-flag',
      // @ts-expect-error this is the case we are testing
      decide: async () => undefined,
      defaultValue: true,
    });

    await expect(asyncFlag(firstRequest)).resolves.toEqual(true);

    socket1.destroy();
  });

  it('throws an error when the decide function returns undefined and no defaultValue is provided', async () => {
    const [firstRequest, socket1] = createRequest();
    const syncFlag = flag<boolean>({
      key: 'sync-flag',
      // @ts-expect-error this is the case we are testing
      decide: () => undefined,
    });

    await expect(syncFlag(firstRequest)).rejects.toThrow(
      '@vercel/flags: Flag "sync-flag" must have a defaultValue or a decide function that returns a value',
    );

    const asyncFlag = flag<string>({
      key: 'async-flag',
      // @ts-expect-error this is the case we are testing
      decide: async () => undefined,
    });

    await expect(asyncFlag(firstRequest)).rejects.toThrow(
      '@vercel/flags: Flag "async-flag" must have a defaultValue or a decide function that returns a value',
    );

    socket1.destroy();
  });

  it('respects overrides', async () => {
    const decide = vi.fn(() => false);
    const f = flag<boolean>({ key: 'first-flag', decide });
    const override = await encrypt({ 'first-flag': true });

    const [firstRequest, socket1] = createRequest({
      'vercel-flag-overrides': override,
    });
    await expect(f(firstRequest)).resolves.toEqual(true);
    expect(decide).not.toHaveBeenCalled();
    socket1.destroy();
  });

  it('uses precomputed values', async () => {
    const decide = vi.fn(() => true);
    const f = flag<boolean>({
      key: 'first-flag',
      decide,
      options: [false, true],
    });
    const flagGroup = [f];
    const code = await precompute(flagGroup);
    expect(decide).toHaveBeenCalledTimes(1);
    await expect(f(code, flagGroup)).resolves.toEqual(true);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('falls back to the defaultValue if an async decide throws', async () => {
    let rejectPromise: () => void;
    const promise = new Promise<boolean>((resolve, reject) => {
      rejectPromise = reject;
    });

    const mockDecide = vi.fn(() => promise);
    const catchFn = vi.fn();

    const f = flag<boolean>({
      key: 'first-flag',
      decide: mockDecide,
      defaultValue: false,
    });

    // first request
    const headersOfFirstRequest = new Headers();
    mocks.headers.mockReturnValueOnce(headersOfFirstRequest);
    const value1 = f().catch(catchFn);

    // @ts-expect-error this is defined
    rejectPromise(new Error('custom error'));
    await promise.catch(() => {});

    await expect(value1).resolves.toEqual(false);
    expect(catchFn).not.toHaveBeenCalled();
    expect(mockDecide).toHaveBeenCalledTimes(1);
  });

  it('falls back to the defaultValue if a sync decide throws', async () => {
    const mockDecide = vi.fn(() => {
      throw new Error('custom error');
    });

    const [firstRequest, socket1] = createRequest();
    const f = flag<boolean>({
      key: 'first-flag',
      decide: mockDecide,
      defaultValue: false,
    });

    mocks.headers.mockReturnValueOnce(new Headers());

    await expect(f(firstRequest)).resolves.toEqual(false);
    expect(mockDecide).toHaveBeenCalledTimes(1);
    socket1.destroy();
  });
});

describe('dynamic io', () => {
  it('should re-throw dynamic usage erorrs even when a defaultValue is present', async () => {
    const mockDecide = vi.fn(() => {
      const error = new Error('dynamic usage error');
      (error as any).digest = 'DYNAMIC_SERVER_USAGE;dynamic usage error';
      throw error;
    });
    const f = flag<boolean>({
      key: 'first-flag',
      decide: mockDecide,
      defaultValue: false,
    });
    expect(mockDecide).toHaveBeenCalledTimes(0);
    await expect(() => f()).rejects.toThrow('dynamic usage error');
    expect(mockDecide).toHaveBeenCalledTimes(1);
  });
});

describe('adapters', () => {
  function createTestAdapter() {
    return function testAdapter<ValueType, EntitiesType>(
      value: ValueType,
    ): Adapter<ValueType, EntitiesType> {
      return {
        decide: () => value,
        origin: (key) => `fake-origin#${key}`,
      };
    };
  }

  it("should use the adapter's decide function when provided", async () => {
    const testAdapter = createTestAdapter();

    mocks.headers.mockReturnValueOnce(new Headers());

    const f = flag<number>({
      key: 'adapter-flag',
      adapter: testAdapter(5),
    });

    expect(f).toHaveProperty('key', 'adapter-flag');
    await expect(f()).resolves.toEqual(5);
    expect(f).toHaveProperty('origin', 'fake-origin#adapter-flag');
  });

  it("should throw when an adapter's decide function returns undefined", async () => {
    const testAdapter = createTestAdapter();

    mocks.headers.mockReturnValueOnce(new Headers());

    const f = flag<boolean>({
      key: 'adapter-flag',
      // @ts-expect-error this is the case we are testing
      adapter: testAdapter(undefined),
    });

    expect(f).toHaveProperty('key', 'adapter-flag');
    await expect(f()).rejects.toThrow(
      '@vercel/flags: Flag "adapter-flag" must have a defaultValue or a decide function that returns a value',
    );
    expect(f).toHaveProperty('origin', 'fake-origin#adapter-flag');
  });
});

import { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { Readable } from 'node:stream';
import type { NextApiRequestCookies } from 'next/dist/server/api-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type Adapter, encryptOverrides, setTracerProvider } from '..';
import {
  clearDedupeCacheForCurrentRequest,
  dedupe,
  evaluate,
  flag,
  precompute,
} from '.';

const mocks = vi.hoisted(() => {
  return {
    headers: vi.fn(() => new Headers()),
    cookies: vi.fn(() => ({
      get: vi.fn(),
    })),
  };
});

const requestContextSymbol = Symbol.for('@vercel/request-context');
const previousRequestContext = Reflect.get(globalThis, requestContextSymbol);

type ReportCall = {
  readonly key: string;
  readonly value: unknown;
  readonly data: Record<string, unknown>;
};

function createRequestContext() {
  const calls: ReportCall[] = [];
  const flags = {
    calls,
    reportValue(
      this: { calls: ReportCall[] },
      key: string,
      value: unknown,
      data: Record<string, unknown>,
    ) {
      this.calls.push({ key, value, data });
    },
  };

  return { flags };
}

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
  const request = new IncomingMessage(
    socket as unknown as Socket,
  ) as IncomingMessage & {
    cookies: NextApiRequestCookies;
  };
  request.cookies = cookies;
  request.headers.cookie = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');

  return [request, socket];
}

describe('exports', () => {
  it('should export flag', () => {
    expect(typeof flag).toBe('function');
  });
  it('should export precompute', () => {
    expect(typeof precompute).toBe('function');
  });
  it('should export dedupe', () => {
    expect(typeof dedupe).toBe('function');
  });
  it('should export clearDedupeCacheForCurrentRequest', () => {
    expect(typeof clearDedupeCacheForCurrentRequest).toBe('function');
  });
});

describe('flag on app router', () => {
  beforeAll(() => {
    // a random secret for testing purposes
    process.env.FLAGS_SECRET = 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc';
  });

  afterEach(() => {
    if (previousRequestContext === undefined) {
      Reflect.deleteProperty(globalThis, requestContextSymbol);
      return;
    }

    Reflect.set(globalThis, requestContextSymbol, previousRequestContext);
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

  it('throws when passing invalid adapter', () => {
    expect(() => flag({ key: 'my-key', adapter: {} as any })).toThrowError(
      'flags: The adapter passed to flag "my-key" does not have a "decide" method.',
    );
  });

  it('throws when passing no decide function', () => {
    expect(() => flag({ key: 'my-key' } as any)).toThrowError(
      'flags: You passed a flag declaration that does not have a "decide" method for flag "my-key"',
    );
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
    const override = await encryptOverrides({ 'first-flag': true });
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

  it('does not crash when override reporting hook is not a function', async () => {
    Reflect.set(globalThis, requestContextSymbol, {
      get() {
        return { flags: { reportValue: true } };
      },
    });

    const decide = vi.fn(() => false);
    const f = flag<boolean>({
      key: 'first-flag',
      decide,
      config: { reportValue: false },
    });

    const headersOfFirstRequest = new Headers();
    const override = await encryptOverrides({ 'first-flag': true });
    const cookieMock = vi.fn((cookieName: string) => {
      if (cookieName === 'vercel-flag-overrides') {
        return { name: 'vercel-flag-overrides', value: override };
      }
      return undefined;
    });
    mocks.headers.mockReturnValueOnce(headersOfFirstRequest);
    mocks.cookies.mockReturnValueOnce({ get: cookieMock });

    await expect(f()).resolves.toEqual(true);
    expect(decide).not.toHaveBeenCalled();
  });

  it('preserves method binding for normal flag reporting hooks', async () => {
    const requestContext = createRequestContext();
    Reflect.set(globalThis, requestContextSymbol, {
      get() {
        return requestContext;
      },
    });

    const f = flag<boolean>({
      key: 'first-flag',
      decide: () => true,
    });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(f()).resolves.toEqual(true);
    expect(requestContext.flags.calls).toEqual([
      {
        key: 'first-flag',
        value: true,
        data: expect.objectContaining({
          sdkVersion: expect.any(String),
        }),
      },
    ]);
  });

  it('honors adapter-level reportValue false', async () => {
    const requestContext = createRequestContext();
    Reflect.set(globalThis, requestContextSymbol, {
      get() {
        return requestContext;
      },
    });

    const f = flag<boolean>({
      key: 'first-flag',
      adapter: {
        config: { reportValue: false },
        decide: () => true,
      },
    });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(f()).resolves.toEqual(true);
    expect(requestContext.flags.calls).toEqual([]);
  });

  it('lets flag-level reportValue override adapter config', async () => {
    const requestContext = createRequestContext();
    Reflect.set(globalThis, requestContextSymbol, {
      get() {
        return requestContext;
      },
    });

    const f = flag<boolean>({
      key: 'first-flag',
      config: { reportValue: true },
      adapter: {
        config: { reportValue: false },
        decide: () => true,
      },
    });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(f()).resolves.toEqual(true);
    expect(requestContext.flags.calls).toEqual([
      {
        key: 'first-flag',
        value: true,
        data: expect.objectContaining({
          sdkVersion: expect.any(String),
        }),
      },
    ]);
  });

  it('preserves method binding for override reporting hooks', async () => {
    const requestContext = createRequestContext();
    Reflect.set(globalThis, requestContextSymbol, {
      get() {
        return requestContext;
      },
    });

    const decide = vi.fn(() => false);
    const f = flag<boolean>({
      key: 'first-flag',
      decide,
      config: { reportValue: false },
    });

    const headersOfFirstRequest = new Headers();
    const override = await encryptOverrides({ 'first-flag': true });
    const cookieMock = vi.fn((cookieName: string) => {
      if (cookieName === 'vercel-flag-overrides') {
        return { name: 'vercel-flag-overrides', value: override };
      }
      return undefined;
    });
    mocks.headers.mockReturnValueOnce(headersOfFirstRequest);
    mocks.cookies.mockReturnValueOnce({ get: cookieMock });

    await expect(f()).resolves.toEqual(true);
    expect(decide).not.toHaveBeenCalled();
    expect(requestContext.flags.calls).toEqual([
      {
        key: 'first-flag',
        value: true,
        data: expect.objectContaining({
          reason: 'override',
          sdkVersion: expect.any(String),
        }),
      },
    ]);
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('falling back to its defaultValue'),
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it('falls back to the defaultValue if a sync decide throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('falling back to its defaultValue'),
      expect.any(Error),
    );

    warnSpy.mockRestore();
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
      'flags: Flag "sync-flag" must have a defaultValue or a decide function that returns a value',
    );

    const asyncFlag = flag<string>({
      key: 'async-flag',
      // @ts-expect-error this is the case we are testing
      decide: async () => undefined,
    });

    await expect(asyncFlag()).rejects.toThrow(
      'flags: Flag "async-flag" must have a defaultValue or a decide function that returns a value',
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not be evaluated'),
    );
    socket1.destroy();

    warnSpy.mockRestore();
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
      'flags: Flag "sync-flag" must have a defaultValue or a decide function that returns a value',
    );

    const asyncFlag = flag<string>({
      key: 'async-flag',
      // @ts-expect-error this is the case we are testing
      decide: async () => undefined,
    });

    await expect(asyncFlag(firstRequest)).rejects.toThrow(
      'flags: Flag "async-flag" must have a defaultValue or a decide function that returns a value',
    );

    socket1.destroy();
  });

  it('respects overrides', async () => {
    const decide = vi.fn(() => false);
    const f = flag<boolean>({ key: 'first-flag', decide });
    const override = await encryptOverrides({ 'first-flag': true });

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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('falling back to its defaultValue'),
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it('falls back to the defaultValue if a sync decide throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('falling back to its defaultValue'),
      expect.any(Error),
    );
    socket1.destroy();

    warnSpy.mockRestore();
  });
});

describe('dynamic io', () => {
  it('should re-throw dynamic usage erorrs even when a defaultValue is present', async () => {
    const mockDecide = vi.fn(() => {
      const error = new Error('dynamic usage error');
      (error as Error & { digest: string }).digest =
        'DYNAMIC_SERVER_USAGE;dynamic usage error';
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
      'flags: Flag "adapter-flag" must have a defaultValue or a decide function that returns a value',
    );
    expect(f).toHaveProperty('origin', 'fake-origin#adapter-flag');
  });

  it("should pass the defaultValue to the adapter's decide function", async () => {
    const outerValue = Math.random();

    const exampleFlag = flag<number>({
      key: 'example-flag',
      defaultValue: outerValue,
      adapter: {
        decide: ({ defaultValue }) => (defaultValue as number) || -1,
        origin: (key) => `fake-origin#${key}`,
      },
    });

    expect(await exampleFlag()).toBe(outerValue);
  });

  it('accepts an adapter factory passed by reference', async () => {
    // A zero-arg factory, like `vercelAdapter`, can be passed directly
    // (`adapter: vercelAdapter`) instead of being called (`adapter: vercelAdapter()`).
    const vercelAdapter = <ValueType, EntitiesType>(): Adapter<
      ValueType,
      EntitiesType
    > => ({
      decide: () => 5 as ValueType,
      origin: (key) => `fake-origin#${key}`,
    });

    mocks.headers.mockReturnValueOnce(new Headers());

    const f = flag<number>({
      key: 'factory-flag',
      adapter: vercelAdapter,
    });

    expect(f).toHaveProperty('key', 'factory-flag');
    await expect(f()).resolves.toEqual(5);
    // origin/identify still resolve from the factory-produced adapter
    expect(f).toHaveProperty('origin', 'fake-origin#factory-flag');
  });

  it('resolves config.reportValue from a factory-passed adapter', async () => {
    const makeAdapter = (): Adapter<boolean, any> => ({
      decide: () => true,
      config: { reportValue: false },
    });

    const requestContext = createRequestContext();
    Reflect.set(globalThis, requestContextSymbol, {
      get() {
        return requestContext;
      },
    });

    try {
      mocks.headers.mockReturnValueOnce(new Headers());

      const f = flag<boolean>({ key: 'no-report', adapter: makeAdapter });
      await expect(f()).resolves.toEqual(true);

      // adapter's `reportValue: false` is honored, so nothing is reported
      expect(requestContext.flags.calls).toHaveLength(0);
    } finally {
      if (previousRequestContext === undefined) {
        Reflect.deleteProperty(globalThis, requestContextSymbol);
      } else {
        Reflect.set(globalThis, requestContextSymbol, previousRequestContext);
      }
    }
  });
});

describe('evaluate', () => {
  beforeAll(() => {
    process.env.FLAGS_SECRET = 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc';
  });

  afterEach(() => {
    if (previousRequestContext === undefined) {
      Reflect.deleteProperty(globalThis, requestContextSymbol);
      return;
    }
    Reflect.set(globalThis, requestContextSymbol, previousRequestContext);
  });

  // Factory that mints adapters all sharing the same closure-captured id.
  // Each call returns a fresh adapter object (mirroring the
  // pattern where every flag does `adapter: adapter()`).
  function makeBulkAdapter<V>(opts?: {
    bulkDecide?: Adapter<V, any>['bulkDecide'];
    decide?: Adapter<V, any>['decide'];
    identify?: Adapter<V, any>['identify'];
    omitAdapterId?: boolean;
    omitBulkDecide?: boolean;
  }) {
    const id = Symbol('test-adapter');
    return (): Adapter<V, any> => ({
      ...(opts?.omitAdapterId ? {} : { adapterId: id }),
      origin: 'test://origin',
      decide:
        opts?.decide ??
        (() => {
          throw new Error('decide should not be called in bulk path');
        }),
      identify: opts?.identify,
      ...(opts?.omitBulkDecide ? {} : { bulkDecide: opts?.bulkDecide }),
    });
  }

  it('calls bulkDecide once for flags sharing an adapterId and identify source', async () => {
    const bulkDecideMock = vi.fn().mockResolvedValue({ a: 'A', b: 'B' });
    const decideMock = vi.fn();
    const adapter = makeBulkAdapter<string>({
      bulkDecide: bulkDecideMock,
      decide: decideMock,
    });

    const a = flag<string>({ key: 'a', adapter: adapter() });
    const b = flag<string>({ key: 'b', adapter: adapter() });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(evaluate({ a, b })).resolves.toEqual({ a: 'A', b: 'B' });

    expect(bulkDecideMock).toHaveBeenCalledTimes(1);
    expect(bulkDecideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: [
          { key: 'a', defaultValue: undefined },
          { key: 'b', defaultValue: undefined },
        ],
        entities: undefined,
      }),
    );
    expect(decideMock).not.toHaveBeenCalled();
  });

  it('batches flags that pass the same adapter factory by reference', async () => {
    const bulkDecideMock = vi.fn().mockResolvedValue({ a: 'A', b: 'B' });
    const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });

    // Pass the factory by reference rather than calling it. Both flags share the
    // factory's closure-captured adapterId, so they still batch into one call.
    const a = flag<string>({ key: 'a', adapter });
    const b = flag<string>({ key: 'b', adapter });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(evaluate({ a, b })).resolves.toEqual({ a: 'A', b: 'B' });

    expect(bulkDecideMock).toHaveBeenCalledTimes(1);
  });

  it('splits into separate bulkDecide calls when identify sources differ', async () => {
    const bulkDecideMock = vi
      .fn()
      .mockImplementation(({ flags }: { flags: { key: string }[] }) =>
        Object.fromEntries(flags.map((f) => [f.key, `v-${f.key}`])),
      );
    const identifyA = () => ({ user: 'alice' });
    const identifyB = () => ({ user: 'bob' });

    const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });
    const a = flag({
      key: 'a',
      adapter: adapter(),
      identify: identifyA,
    });
    const b = flag({
      key: 'b',
      adapter: adapter(),
      identify: identifyB,
    });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(evaluate({ a, b })).resolves.toEqual({ a: 'v-a', b: 'v-b' });
    expect(bulkDecideMock).toHaveBeenCalledTimes(2);
  });

  it('splits into separate bulkDecide calls when adapterIds differ', async () => {
    const bulkA = vi.fn().mockResolvedValue({ a: 'A' });
    const bulkB = vi.fn().mockResolvedValue({ b: 'B' });
    const adapterA = makeBulkAdapter<string>({ bulkDecide: bulkA });
    const adapterB = makeBulkAdapter<string>({ bulkDecide: bulkB });

    const a = flag<string>({ key: 'a', adapter: adapterA() });
    const b = flag<string>({ key: 'b', adapter: adapterB() });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(evaluate({ a, b })).resolves.toEqual({ a: 'A', b: 'B' });
    expect(bulkA).toHaveBeenCalledTimes(1);
    expect(bulkB).toHaveBeenCalledTimes(1);
  });

  it('falls back to per-flag decide when adapter has no adapterId', async () => {
    const bulkDecideMock = vi.fn();
    const decideMock = vi.fn().mockResolvedValue('from-decide');
    const adapter = makeBulkAdapter<string>({
      bulkDecide: bulkDecideMock,
      decide: decideMock,
      omitAdapterId: true,
    });

    const a = flag<string>({ key: 'a', adapter: adapter() });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(evaluate({ a })).resolves.toEqual({ a: 'from-decide' });
    expect(bulkDecideMock).not.toHaveBeenCalled();
    expect(decideMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to per-flag decide when adapter has no bulkDecide', async () => {
    const decideMock = vi.fn().mockResolvedValue('single');
    const adapter = makeBulkAdapter<string>({
      decide: decideMock,
      omitBulkDecide: true,
    });

    const a = flag<string>({ key: 'a', adapter: adapter() });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(evaluate({ a })).resolves.toEqual({ a: 'single' });
    expect(decideMock).toHaveBeenCalledTimes(1);
  });

  it('keeps inline-decide flags out of the bulk path', async () => {
    const inlineDecide = vi.fn(() => 'inline-result');
    const bulkDecideMock = vi.fn().mockResolvedValue({ b: 'bulk-result' });

    const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });
    const a = flag<string>({ key: 'a', decide: inlineDecide });
    const b = flag<string>({ key: 'b', adapter: adapter() });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(evaluate({ a, b })).resolves.toEqual({
      a: 'inline-result',
      b: 'bulk-result',
    });
    expect(inlineDecide).toHaveBeenCalledTimes(1);
    expect(bulkDecideMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to defaultValue when bulkDecide throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bulkDecideMock = vi.fn().mockRejectedValue(new Error('bulk failed'));
    const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });

    const a = flag<string>({
      key: 'a',
      adapter: adapter(),
      defaultValue: 'fa',
    });
    const b = flag<string>({
      key: 'b',
      adapter: adapter(),
      defaultValue: 'fb',
    });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(evaluate({ a, b })).resolves.toEqual({ a: 'fa', b: 'fb' });
    expect(bulkDecideMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('rejects when bulkDecide throws and a flag has no defaultValue', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bulkDecideMock = vi.fn().mockRejectedValue(new Error('bulk failed'));
    const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });

    const a = flag<string>({
      key: 'a',
      adapter: adapter(),
      defaultValue: 'fa',
    });
    const b = flag<string>({ key: 'b', adapter: adapter() });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(evaluate({ a, b })).rejects.toThrow('bulk failed');
    warnSpy.mockRestore();
  });

  it('falls back to defaultValue for keys bulkDecide omits', async () => {
    const bulkDecideMock = vi.fn().mockResolvedValue({ a: 'A' });
    const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });

    const a = flag<string>({ key: 'a', adapter: adapter() });
    const b = flag<string>({
      key: 'b',
      adapter: adapter(),
      defaultValue: 'fb',
    });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(evaluate({ a, b })).resolves.toEqual({ a: 'A', b: 'fb' });
  });

  it('lets overrides win over bulkDecide results', async () => {
    const bulkDecideMock = vi.fn().mockResolvedValue({ a: 'bulk-value' });
    const adapter = makeBulkAdapter<boolean>({ bulkDecide: bulkDecideMock });

    const a = flag<boolean>({ key: 'a', adapter: adapter() });

    const override = await encryptOverrides({ a: true });
    const cookieMock = vi.fn((name: string) =>
      name === 'vercel-flag-overrides'
        ? { name: 'vercel-flag-overrides', value: override }
        : undefined,
    );
    mocks.headers.mockReturnValueOnce(new Headers());
    mocks.cookies.mockReturnValueOnce({ get: cookieMock });

    await expect(evaluate({ a })).resolves.toEqual({ a: true });
    expect(bulkDecideMock).not.toHaveBeenCalled();
  });

  it('omits overridden flags from bulkDecide input', async () => {
    const bulkDecideMock = vi.fn(({ flags }: { flags: { key: string }[] }) =>
      Object.fromEntries(flags.map((f) => [f.key, `bulk-${f.key}`])),
    );
    const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });

    const a = flag<string>({ key: 'a', adapter: adapter() });
    const b = flag<string>({ key: 'b', adapter: adapter() });

    const override = await encryptOverrides({ a: 'overridden' });
    const cookieMock = vi.fn((name: string) =>
      name === 'vercel-flag-overrides'
        ? { name: 'vercel-flag-overrides', value: override }
        : undefined,
    );
    mocks.headers.mockReturnValueOnce(new Headers());
    mocks.cookies.mockReturnValueOnce({ get: cookieMock });

    await expect(evaluate({ a, b })).resolves.toEqual({
      a: 'overridden',
      b: 'bulk-b',
    });
    expect(bulkDecideMock).toHaveBeenCalledTimes(1);
    expect(bulkDecideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: [{ key: 'b', defaultValue: undefined }],
      }),
    );
  });

  it('populates the evaluation cache so a subsequent flagFn() hits cache', async () => {
    const bulkDecideMock = vi.fn().mockResolvedValue({ a: 'A' });
    const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });

    const a = flag<string>({ key: 'a', adapter: adapter() });

    const headers = new Headers();
    mocks.headers.mockReturnValue(headers);
    await expect(evaluate({ a })).resolves.toEqual({ a: 'A' });
    expect(bulkDecideMock).toHaveBeenCalledTimes(1);

    // Subsequent direct call in the same "request" (same headers object)
    // should return the cached value without re-calling bulkDecide or decide.
    await expect(a()).resolves.toEqual('A');
    expect(bulkDecideMock).toHaveBeenCalledTimes(1);
  });

  it('preserves input key order in the result', async () => {
    const adapter = makeBulkAdapter<string>({
      bulkDecide: ({ flags }: { flags: { key: string }[] }) =>
        Object.fromEntries(flags.map((f) => [f.key, f.key])),
    });

    const zebra = flag<string>({ key: 'zebra', adapter: adapter() });
    const apple = flag<string>({ key: 'apple', adapter: adapter() });

    mocks.headers.mockReturnValueOnce(new Headers());
    const result = await evaluate({ zebra, apple });
    expect(Object.keys(result)).toEqual(['zebra', 'apple']);
  });

  describe('with request argument', () => {
    it('resolves flags using a Pages Router IncomingMessage without touching next/headers', async () => {
      const bulkDecideMock = vi.fn().mockResolvedValue({ a: 'A', b: 'B' });
      const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });

      const a = flag<string>({ key: 'a', adapter: adapter() });
      const b = flag<string>({ key: 'b', adapter: adapter() });

      mocks.headers.mockClear();
      const [request, socket] = createRequest();
      await expect(evaluate({ a, b }, request)).resolves.toEqual({
        a: 'A',
        b: 'B',
      });
      expect(mocks.headers).not.toHaveBeenCalled();
      expect(bulkDecideMock).toHaveBeenCalledTimes(1);
      socket.destroy();
    });

    it('accepts a web Request (NextRequest) and skips next/headers', async () => {
      const bulkDecideMock = vi.fn().mockResolvedValue({ a: 'A', b: 'B' });
      const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });

      const a = flag<string>({ key: 'a', adapter: adapter() });
      const b = flag<string>({ key: 'b', adapter: adapter() });

      mocks.headers.mockClear();
      const webRequest = new Request('http://example.com/', {
        headers: { cookie: 'foo=bar' },
      });
      await expect(evaluate({ a, b }, webRequest)).resolves.toEqual({
        a: 'A',
        b: 'B',
      });
      expect(mocks.headers).not.toHaveBeenCalled();
      expect(bulkDecideMock).toHaveBeenCalledTimes(1);

      // bulkDecide receives the request's own headers (not a copy via
      // transformToHeaders) — verify by checking a header round-trips.
      const [callArgs] = bulkDecideMock.mock.calls;
      expect(callArgs[0].headers.get('cookie')).toBe('foo=bar');
    });

    it('array overload preserves order and skips next/headers', async () => {
      const bulkDecideMock = vi.fn().mockResolvedValue({ z: 'Z', a: 'A' });
      const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });

      const z = flag<string>({ key: 'z', adapter: adapter() });
      const a = flag<string>({ key: 'a', adapter: adapter() });

      mocks.headers.mockClear();
      const [request, socket] = createRequest();
      const result = await evaluate([z, a], request);
      // positional: index 0 → z, index 1 → a
      expect(result).toEqual(['Z', 'A']);
      expect(mocks.headers).not.toHaveBeenCalled();
      socket.destroy();
    });

    it('shares the per-request cache with direct flag(req) calls', async () => {
      const bulkDecideMock = vi.fn().mockResolvedValue({ a: 'A' });
      const decideMock = vi.fn(() => 'inline');
      const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });

      const a = flag<string>({ key: 'a', adapter: adapter() });
      const b = flag<string>({ key: 'b', decide: decideMock });

      const [request, socket] = createRequest();
      await expect(evaluate({ a, b }, request)).resolves.toEqual({
        a: 'A',
        b: 'inline',
      });

      // Subsequent direct call in the same request should hit cache,
      // not re-invoke bulkDecide/decide.
      await expect(a(request)).resolves.toEqual('A');
      await expect(b(request)).resolves.toEqual('inline');
      expect(bulkDecideMock).toHaveBeenCalledTimes(1);
      expect(decideMock).toHaveBeenCalledTimes(1);
      socket.destroy();
    });

    it('accepts a web Request (NextRequest) passed directly to flag(req)', async () => {
      const decideMock = vi.fn(({ cookies }) => cookies.get('flag')?.value);
      const a = flag<string | undefined>({ key: 'a', decide: decideMock });

      mocks.headers.mockClear();
      const webRequest = new Request('http://example.com/', {
        headers: { cookie: 'flag=on' },
      });

      await expect(a(webRequest)).resolves.toEqual('on');
      expect(mocks.headers).not.toHaveBeenCalled();
    });
  });
});

describe('tracing', () => {
  beforeAll(() => {
    process.env.FLAGS_SECRET = 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc';
  });

  // `setTracerProvider` writes to a global symbol; capture/restore it so a
  // registered tracer doesn't leak into other test files.
  const traceSymbol = Symbol.for('flags:global-trace');
  const previousTraceProvider = Reflect.get(globalThis, traceSymbol);

  afterEach(() => {
    if (previousTraceProvider === undefined) {
      Reflect.deleteProperty(globalThis, traceSymbol);
    } else {
      Reflect.set(globalThis, traceSymbol, previousTraceProvider);
    }
    if (previousRequestContext === undefined) {
      Reflect.deleteProperty(globalThis, requestContextSymbol);
    } else {
      Reflect.set(globalThis, requestContextSymbol, previousRequestContext);
    }
  });

  interface RecordedSpan {
    name: string;
    attributes: Record<string, unknown>;
    status?: { code: number; message?: string };
    ended: boolean;
  }

  // Minimal recording TracerProvider. `trace()` only needs
  // `getTracer().startActiveSpan(name, fn)` plus
  // `setAttribute(s)`/`setStatus`/`end` on the span, so we record just those.
  function recordSpans(): RecordedSpan[] {
    const spans: RecordedSpan[] = [];
    const tracer = {
      startActiveSpan(name: string, fn: (span: any) => any) {
        const record: RecordedSpan = { name, attributes: {}, ended: false };
        spans.push(record);
        return fn({
          setAttributes(attrs: Record<string, unknown>) {
            Object.assign(record.attributes, attrs);
          },
          setAttribute(key: string, value: unknown) {
            record.attributes[key] = value;
          },
          setStatus(status: { code: number; message?: string }) {
            record.status = status;
          },
          end() {
            record.ended = true;
          },
        });
      },
    };
    setTracerProvider({ getTracer: () => tracer } as any);
    return spans;
  }

  function makeBulkAdapter<V>(opts: {
    bulkDecide: Adapter<V, any>['bulkDecide'];
  }) {
    const id = Symbol('trace-adapter');
    return (): Adapter<V, any> => ({
      adapterId: id,
      origin: 'test://origin',
      decide: () => {
        throw new Error('decide should not be called in bulk path');
      },
      bulkDecide: opts.bulkDecide,
    });
  }

  it('emits an evaluate span and a batch span with aggregate attributes', async () => {
    const adapter = makeBulkAdapter<string>({
      bulkDecide: vi.fn().mockResolvedValue({ a: 'A', b: 'B' }),
    });
    const a = flag<string>({ key: 'a', adapter: adapter() });
    const b = flag<string>({ key: 'b', adapter: adapter() });

    const spans = recordSpans();
    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(evaluate({ a, b })).resolves.toEqual({ a: 'A', b: 'B' });

    const evaluateSpan = spans.find((s) => s.name === 'evaluate');
    expect(evaluateSpan).toBeDefined();
    expect(evaluateSpan!.attributes.flagCount).toBe(2);
    expect(evaluateSpan!.ended).toBe(true);

    const batchSpans = spans.filter((s) => s.name === 'batch');
    expect(batchSpans).toHaveLength(1);
    const [batchSpan] = batchSpans;
    expect(batchSpan!.attributes).toMatchObject({
      method: 'bulk',
      keys: ['a', 'b'],
      cachedCount: 0,
      overrideCount: 0,
      decidedCount: 2,
    });
    expect(typeof batchSpan!.attributes.adapterId).toBe('string');
    expect(batchSpan!.ended).toBe(true);

    // Bulkable flags must not also emit their own per-flag `run`/`flag` span —
    // that's the per-flag overhead the batch span exists to replace.
    expect(spans.some((s) => s.name === 'run')).toBe(false);
    expect(spans.some((s) => s.name === 'flag')).toBe(false);
  });

  it('keeps the per-flag `flag` span for standalone (non-bulkable) flags', async () => {
    const a = flag<string>({ key: 'a', decide: () => 'inline' });

    const spans = recordSpans();
    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(evaluate({ a })).resolves.toEqual({ a: 'inline' });

    expect(spans.some((s) => s.name === 'evaluate')).toBe(true);
    expect(spans.some((s) => s.name === 'batch')).toBe(false);
    // standalone flags resolve via `flagFn()`, which still emits a `flag` span
    expect(spans.some((s) => s.name === 'flag')).toBe(true);
  });

  it('counts overrides separately from decided flags on the batch span', async () => {
    const adapter = makeBulkAdapter<string>({
      bulkDecide: vi.fn().mockResolvedValue({ a: 'A', b: 'B' }),
    });
    const a = flag<string>({ key: 'a', adapter: adapter() });
    const b = flag<string>({ key: 'b', adapter: adapter() });

    const override = await encryptOverrides({ a: 'overridden' });
    const cookieMock = vi.fn((name: string) =>
      name === 'vercel-flag-overrides'
        ? { name: 'vercel-flag-overrides', value: override }
        : undefined,
    );

    const spans = recordSpans();
    mocks.headers.mockReturnValueOnce(new Headers());
    mocks.cookies.mockReturnValueOnce({ get: cookieMock });
    await expect(evaluate({ a, b })).resolves.toEqual({
      a: 'overridden',
      b: 'B',
    });

    const batch = spans.find((s) => s.name === 'batch');
    expect(batch).toBeDefined();
    expect(batch!.attributes).toMatchObject({
      cachedCount: 0,
      overrideCount: 1,
      decidedCount: 1,
    });
  });

  it('emits a flag span with the key and method for a direct app-router call', async () => {
    const a = flag<string>({ key: 'my-flag', decide: () => 'value' });

    const spans = recordSpans();
    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(a()).resolves.toBe('value');

    const flagSpan = spans.find((s) => s.name === 'flag');
    expect(flagSpan).toBeDefined();
    expect(flagSpan!.attributes).toMatchObject({
      key: 'my-flag',
      method: 'decided',
    });
    expect(flagSpan!.ended).toBe(true);
  });

  it('records method "override" on the flag span when an override is set', async () => {
    const a = flag<string>({ key: 'my-flag', decide: () => 'value' });

    const override = await encryptOverrides({ 'my-flag': 'forced' });
    const cookieMock = vi.fn((name: string) =>
      name === 'vercel-flag-overrides'
        ? { name: 'vercel-flag-overrides', value: override }
        : undefined,
    );

    const spans = recordSpans();
    mocks.headers.mockReturnValueOnce(new Headers());
    mocks.cookies.mockReturnValueOnce({ get: cookieMock });
    await expect(a()).resolves.toBe('forced');

    const flagSpan = spans.find((s) => s.name === 'flag');
    expect(flagSpan!.attributes).toMatchObject({
      key: 'my-flag',
      method: 'override',
    });
  });

  it('records method "cached" on a repeated call within the same request', async () => {
    const decide = vi.fn(() => 'value');
    const a = flag<string>({ key: 'my-flag', decide });

    // Same headers object both calls → same per-request cache key.
    const headers = new Headers();
    mocks.headers.mockReturnValueOnce(headers).mockReturnValueOnce(headers);

    const spans = recordSpans();
    await expect(a()).resolves.toBe('value');
    await expect(a()).resolves.toBe('value');
    expect(decide).toHaveBeenCalledTimes(1);

    const methods = spans
      .filter((s) => s.name === 'flag')
      .map((s) => s.attributes.method);
    expect(methods).toEqual(['decided', 'cached']);
  });

  it('precompute emits the same evaluate and batch spans as evaluate', async () => {
    const adapter = makeBulkAdapter<string>({
      bulkDecide: vi.fn().mockResolvedValue({ a: 'A', b: 'B' }),
    });
    const a = flag<string>({ key: 'a', adapter: adapter() });
    const b = flag<string>({ key: 'b', adapter: adapter() });

    const spans = recordSpans();
    mocks.headers.mockReturnValueOnce(new Headers());
    await precompute([a, b]);

    const evaluateSpan = spans.find((s) => s.name === 'evaluate');
    expect(evaluateSpan).toBeDefined();
    // array overload → `flagCount` reflects the array length
    expect(evaluateSpan!.attributes.flagCount).toBe(2);

    const batch = spans.find((s) => s.name === 'batch');
    expect(batch).toBeDefined();
    expect(batch!.attributes).toMatchObject({
      method: 'bulk',
      keys: ['a', 'b'],
      decidedCount: 2,
    });
  });
});

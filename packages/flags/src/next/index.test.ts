import { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { Readable } from 'node:stream';
import type { NextApiRequestCookies } from 'next/dist/server/api-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type Adapter, encryptOverrides } from '..';
import {
  bulk,
  clearDedupeCacheForCurrentRequest,
  dedupe,
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
      'flags: You passed an adapter that does not have a "decide" method for flag "my-key". Did you pass "adapter: exampleAdapter" instead of "adapter: exampleAdapter()"?',
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
});

describe('bulk', () => {
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
    await expect(bulk({ a, b })).resolves.toEqual({ a: 'A', b: 'B' });

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
    await expect(bulk({ a, b })).resolves.toEqual({ a: 'v-a', b: 'v-b' });
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
    await expect(bulk({ a, b })).resolves.toEqual({ a: 'A', b: 'B' });
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
    await expect(bulk({ a })).resolves.toEqual({ a: 'from-decide' });
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
    await expect(bulk({ a })).resolves.toEqual({ a: 'single' });
    expect(decideMock).toHaveBeenCalledTimes(1);
  });

  it('keeps inline-decide flags out of the bulk path', async () => {
    const inlineDecide = vi.fn(() => 'inline-result');
    const bulkDecideMock = vi.fn().mockResolvedValue({ b: 'bulk-result' });

    const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });
    const a = flag<string>({ key: 'a', decide: inlineDecide });
    const b = flag<string>({ key: 'b', adapter: adapter() });

    mocks.headers.mockReturnValueOnce(new Headers());
    await expect(bulk({ a, b })).resolves.toEqual({
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
    await expect(bulk({ a, b })).resolves.toEqual({ a: 'fa', b: 'fb' });
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
    await expect(bulk({ a, b })).rejects.toThrow('bulk failed');
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
    await expect(bulk({ a, b })).resolves.toEqual({ a: 'A', b: 'fb' });
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

    await expect(bulk({ a })).resolves.toEqual({ a: true });
  });

  it('populates the evaluation cache so a subsequent flagFn() hits cache', async () => {
    const bulkDecideMock = vi.fn().mockResolvedValue({ a: 'A' });
    const adapter = makeBulkAdapter<string>({ bulkDecide: bulkDecideMock });

    const a = flag<string>({ key: 'a', adapter: adapter() });

    const headers = new Headers();
    mocks.headers.mockReturnValue(headers);
    await expect(bulk({ a })).resolves.toEqual({ a: 'A' });
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
    const result = await bulk({ zebra, apple });
    expect(Object.keys(result)).toEqual(['zebra', 'apple']);
  });
});

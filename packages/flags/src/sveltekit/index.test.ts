import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Adapter } from '..';
import { encryptOverrides, evaluate, flag, getProviderData } from '.';

// A valid 32-byte (256-bit) base64url key, required by the crypto helpers.
const { secret } = vi.hoisted(() => ({
  secret: Buffer.alloc(32, 7).toString('base64url'),
}));
vi.mock('$env/static/private', () => ({ FLAGS_SECRET: secret }));

const requestContextSymbol = Symbol.for('@vercel/request-context');
const previousRequestContext = Reflect.get(globalThis, requestContextSymbol);

type ReportCall = {
  readonly key: string;
  readonly value: unknown;
  readonly data: Record<string, unknown>;
};

function installRequestContext() {
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
  Reflect.set(globalThis, requestContextSymbol, { get: () => ({ flags }) });
  return calls;
}

afterEach(() => {
  Reflect.set(globalThis, requestContextSymbol, previousRequestContext);
  vi.restoreAllMocks();
});

describe('getProviderData', () => {
  it('is a function', () => {
    expect(typeof getProviderData).toBe('function');
  });

  it('includes declaredInCode and defaultValue', () => {
    const f = flag<boolean>({
      key: 'pd-flag',
      defaultValue: true,
      description: 'desc',
      decide: () => false,
    });
    const data = getProviderData({ f });
    expect(data.definitions?.['pd-flag']).toMatchObject({
      description: 'desc',
      defaultValue: true,
      declaredInCode: true,
    });
  });

  it('surfaces an adapter origin', () => {
    const f = flag<boolean>({
      key: 'origin-flag',
      adapter: { origin: 'https://origin.example', decide: () => true },
    });
    const data = getProviderData({ f });
    expect(data.definitions?.['origin-flag']?.origin).toBe(
      'https://origin.example',
    );
  });
});

describe('flag', () => {
  it('defines a key', async () => {
    const f = flag<boolean>({ key: 'first-flag', decide: () => false });
    expect(f).toHaveProperty('key', 'first-flag');
  });

  it('falls back to defaultValue when decide throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = flag<boolean>({
      key: 'throwing-flag',
      defaultValue: true,
      decide: () => {
        throw new Error('boom');
      },
    });
    await expect(f(new Request('https://example.com'))).resolves.toBe(true);
  });

  it('falls back to defaultValue when decide returns undefined', async () => {
    const f = flag<boolean>({
      key: 'undefined-flag',
      defaultValue: false,
      decide: () => undefined as unknown as boolean,
    });
    await expect(f(new Request('https://example.com'))).resolves.toBe(false);
  });

  it('reports the evaluated value by default', async () => {
    const calls = installRequestContext();
    const f = flag<boolean>({ key: 'reported-flag', decide: () => true });
    await expect(f(new Request('https://example.com'))).resolves.toBe(true);
    expect(calls).toEqual([
      {
        key: 'reported-flag',
        value: true,
        data: expect.objectContaining({ sdkVersion: expect.any(String) }),
      },
    ]);
  });

  it('honors config.reportValue: false', async () => {
    const calls = installRequestContext();
    const f = flag<boolean>({
      key: 'silent-flag',
      decide: () => true,
      config: { reportValue: false },
    });
    await expect(f(new Request('https://example.com'))).resolves.toBe(true);
    expect(calls).toEqual([]);
  });

  it('honors adapter-level reportValue: false', async () => {
    const calls = installRequestContext();
    const f = flag<boolean>({
      key: 'silent-adapter-flag',
      adapter: { config: { reportValue: false }, decide: () => true },
    });
    await expect(f(new Request('https://example.com'))).resolves.toBe(true);
    expect(calls).toEqual([]);
  });

  it('resolves origin from an adapter', () => {
    const value = flag<boolean>({
      key: 'origin-value',
      adapter: { origin: 'https://origin.example', decide: () => true },
    });
    expect(value.origin).toBe('https://origin.example');

    const fn = flag<boolean>({
      key: 'origin-fn',
      adapter: {
        origin: (key) => `https://origin.example/${key}`,
        decide: () => true,
      },
    });
    expect(fn.origin).toBe('https://origin.example/origin-fn');
  });

  it('uses an override cookie instead of calling decide', async () => {
    const decide = vi.fn(() => false);
    const f = flag<boolean>({ key: 'override-flag', decide });
    const override = await encryptOverrides({ 'override-flag': true });
    const request = new Request('https://example.com', {
      headers: { cookie: `vercel-flag-overrides=${override}` },
    });
    await expect(f(request)).resolves.toBe(true);
    expect(decide).not.toHaveBeenCalled();
  });
});

describe('evaluate', () => {
  function createBulkAdapter() {
    const bulkDecide = vi.fn(({ flags }: { flags: { key: string }[] }) =>
      Object.fromEntries(flags.map(({ key }) => [key, `bulk:${key}`])),
    );
    const adapter: Adapter<string, unknown> = {
      adapterId: 'test-adapter',
      // inline decide is never used for bulkable flags, but the type requires it
      decide: () => 'single',
      bulkDecide,
    };
    return { adapter, bulkDecide };
  }

  it('bulk-evaluates flags sharing an adapter in a single call', async () => {
    const { adapter, bulkDecide } = createBulkAdapter();
    const a = flag<string>({ key: 'bulk-a', adapter });
    const b = flag<string>({ key: 'bulk-b', adapter });
    const standalone = flag<string>({
      key: 'standalone',
      decide: () => 'inline',
    });

    const values = await evaluate(
      [a, b, standalone],
      new Request('https://example.com'),
    );

    expect(values).toEqual(['bulk:bulk-a', 'bulk:bulk-b', 'inline']);
    // The two bulkable flags resolve through a single bulkDecide call.
    expect(bulkDecide).toHaveBeenCalledTimes(1);
    expect(bulkDecide.mock.calls[0]![0].flags.map((f) => f.key)).toEqual([
      'bulk-a',
      'bulk-b',
    ]);
  });

  it('returns keyed results for an object input', async () => {
    const { adapter } = createBulkAdapter();
    const a = flag<string>({ key: 'bulk-a', adapter });
    const standalone = flag<string>({
      key: 'standalone',
      decide: () => 'inline',
    });

    const values = await evaluate(
      { a, standalone },
      new Request('https://example.com'),
    );

    expect(values).toEqual({ a: 'bulk:bulk-a', standalone: 'inline' });
  });
});

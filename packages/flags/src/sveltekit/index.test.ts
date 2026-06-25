import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptOverrides, flag, getProviderData } from '.';

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

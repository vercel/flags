import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluate, flag } from '../index';
import { encryptOverrides } from './crypto';
import { findOverridesToken, getOverrides } from './overrides';

const secret = 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc';
const otherSecret = 'oJ2lj1J5UMmvBuiNYzBg4gFkB6ouIWXJSaAI3MC5QhE';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('getOverrides', () => {
  it('reads an override token of the shared secret', async () => {
    vi.stubEnv('FLAGS_SECRET', secret);
    const token = await encryptOverrides({ summerSale: true }, secret);

    await expect(getOverrides(token)).resolves.toEqual({ summerSale: true });
    // Again, from the cache
    await expect(getOverrides(token)).resolves.toEqual({ summerSale: true });
  });

  it('rejects a token which expired after it was cached', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-26T10:00:00Z') });
    vi.stubEnv('FLAGS_SECRET', secret);
    const token = await encryptOverrides({ summerSale: true }, secret, '1m');
    await expect(getOverrides(token)).resolves.toEqual({ summerSale: true });

    // The same token, replayed after its expiry, on the same worker
    vi.setSystemTime(new Date('2026-11-26T10:02:00Z'));

    await expect(getOverrides(token)).resolves.toBeNull();
  });

  it('rejects a cached token after the secret changed', async () => {
    vi.stubEnv('FLAGS_SECRET', secret);
    const token = await encryptOverrides({ summerSale: true }, secret);
    await expect(getOverrides(token)).resolves.toEqual({ summerSale: true });

    // A rotated secret
    vi.stubEnv('FLAGS_SECRET', otherSecret);

    await expect(getOverrides(token)).resolves.toBeNull();
  });

  it('gives nothing without a secret', async () => {
    vi.stubEnv('FLAGS_SECRET', secret);
    const token = await encryptOverrides({ summerSale: true }, secret);
    vi.stubEnv('FLAGS_SECRET', '');

    await expect(getOverrides(token)).resolves.toBeNull();
  });
});

describe('a flag with an override cookie', () => {
  it('ignores the cookie in a new request after the token expired', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-26T10:00:00Z') });
    vi.stubEnv('FLAGS_SECRET', secret);
    const summerSale = flag<boolean>({
      key: 'replayed-summer-sale',
      decide: () => false,
    });
    const token = await encryptOverrides(
      { 'replayed-summer-sale': true },
      secret,
      '1m',
    );
    // Each request is new: its own Request, so no cache of a request applies
    const request = () =>
      new Request('https://shop.example', {
        headers: { cookie: `vercel-flag-overrides=${token}` },
      });

    // Before the expiry, the override applies
    await expect(summerSale(request())).resolves.toBe(true);

    // The same cookie, replayed in a new request after the expiry, on the
    // same worker
    vi.setSystemTime(new Date('2026-11-26T10:02:00Z'));
    await expect(summerSale(request())).resolves.toBe(false);
  });
});

describe('findOverridesToken', () => {
  function cookies(values: Record<string, string>) {
    return {
      get: (name: string) =>
        name in values ? { value: values[name] as string } : undefined,
    };
  }

  it('reads flag-overrides', () => {
    expect(findOverridesToken(cookies({ 'flag-overrides': 'a' }))).toBe('a');
  });

  it('reads vercel-flag-overrides, the cookie of v4', () => {
    expect(findOverridesToken(cookies({ 'vercel-flag-overrides': 'b' }))).toBe(
      'b',
    );
  });

  it('prefers flag-overrides when both are set', () => {
    expect(
      findOverridesToken(
        cookies({ 'flag-overrides': 'a', 'vercel-flag-overrides': 'b' }),
      ),
    ).toBe('a');
  });

  it('skips an empty cookie', () => {
    expect(
      findOverridesToken(
        cookies({ 'flag-overrides': '', 'vercel-flag-overrides': 'b' }),
      ),
    ).toBe('b');
    expect(findOverridesToken(cookies({}))).toBeUndefined();
  });
});

describe('a flag with the flag-overrides cookie', () => {
  function requestWith(cookie: string) {
    return new Request('https://shop.example', { headers: { cookie } });
  }

  it('applies the overrides of flag-overrides', async () => {
    vi.stubEnv('FLAGS_SECRET', secret);
    const banner = flag<boolean>({ key: 'banner', decide: () => false });
    const token = await encryptOverrides({ banner: true }, secret);

    await expect(banner(requestWith(`flag-overrides=${token}`))).resolves.toBe(
      true,
    );
  });

  it('uses only flag-overrides when both cookies are set', async () => {
    vi.stubEnv('FLAGS_SECRET', secret);
    const color = flag<string>({ key: 'color', decide: () => 'blue' });
    const size = flag<string>({ key: 'size', decide: () => 'm' });
    const current = await encryptOverrides({ color: 'red' }, secret);
    const old = await encryptOverrides({ color: 'green', size: 'xl' }, secret);
    const request = requestWith(
      `vercel-flag-overrides=${old}; flag-overrides=${current}`,
    );

    // The overrides of the two cookies are not merged
    await expect(evaluate([color, size], request)).resolves.toEqual([
      'red',
      'm',
    ]);
  });
});

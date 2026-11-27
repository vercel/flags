import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptOverrides } from '../lib/crypto';
import { flag } from '.';
import { getOverrides } from './overrides';

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

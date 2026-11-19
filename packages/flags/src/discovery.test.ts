import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAccessProof,
  createFlagsDiscoveryEndpoint,
  getProviderData,
  verifyAccess,
} from './discovery';
import { bindFlag, defineFlag } from './flag';
import { encryptOverrides } from './overrides';
import { runtime } from './runtime';
import { defineSource } from './source';

const secret = 'Tw1R5-WuhN6vxp9b0s6h0bCdrBQwZXMbGwjzYm1jnUs';

afterEach(() => {
  runtime.reset();
  vi.unstubAllEnvs();
});

const source = defineSource({
  provider: new TypedInMemoryProvider({}),
  project: { system: 'in-memory' },
});

const flags = {
  checkout: bindFlag({
    key: 'checkout',
    source,
    type: 'string',
    options: [{ value: 'control', label: 'Control' }, 'express'],
    defaultValue: 'control',
    description: 'The checkout flow',
  }),
  betaBanner: defineFlag({ key: 'beta-banner', decide: () => false }),
};

describe('getProviderData', () => {
  it('gives the definitions of Flags Explorer', () => {
    expect(getProviderData(flags)).toEqual({
      definitions: {
        'beta-banner': { declaredInCode: true },
        checkout: {
          declaredInCode: true,
          options: [
            { value: 'control', label: 'Control' },
            { value: 'express' },
          ],
          description: 'The checkout flow',
          defaultValue: 'control',
        },
      },
      hints: [],
    });
  });

  it('joins the flags of several modules', () => {
    const data = getProviderData(
      { checkout: flags.checkout },
      { betaBanner: flags.betaBanner },
    );

    expect(Object.keys(data.definitions ?? {})).toEqual([
      'beta-banner',
      'checkout',
    ]);
  });

  it('throws for an export which is not a flag', () => {
    expect(() => getProviderData({ helper: 1 })).toThrow('is not a flag');
  });
});

describe('verifyAccess', () => {
  it('accepts an access proof of the shared secret', async () => {
    const proof = await createAccessProof(secret);

    await expect(verifyAccess(`Bearer ${proof}`, secret)).resolves.toBe(true);
  });

  it('uses FLAGS_SECRET by default', async () => {
    vi.stubEnv('FLAGS_SECRET', secret);
    const proof = await createAccessProof();

    await expect(verifyAccess(`Bearer ${proof}`)).resolves.toBe(true);
  });

  it('rejects a missing header, an other secret and an other purpose', async () => {
    const other = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const overrides = await encryptOverrides({ a: true }, secret);

    await expect(verifyAccess(null, secret)).resolves.toBe(false);
    await expect(
      verifyAccess(`Bearer ${await createAccessProof(other)}`, secret),
    ).resolves.toBe(false);
    await expect(verifyAccess(`Bearer ${overrides}`, secret)).resolves.toBe(
      false,
    );
  });

  it('throws without a secret, or with an invalid secret', async () => {
    vi.stubEnv('FLAGS_SECRET', '');

    await expect(verifyAccess('Bearer x')).rejects.toThrow(
      'flags: verifyAccess needs a secret.',
    );
    await expect(verifyAccess('Bearer x', 'short')).rejects.toThrow(
      'flags: Invalid FLAGS_SECRET.',
    );
  });
});

describe('createFlagsDiscoveryEndpoint', () => {
  const GET = createFlagsDiscoveryEndpoint(() => getProviderData(flags), {
    secret,
  });

  it('returns the data for Flags Explorer', async () => {
    const proof = await createAccessProof(secret);
    const response = await GET(
      new Request('https://shop.example/.well-known/vercel/flags', {
        headers: { authorization: `Bearer ${proof}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-flags-sdk-version')).toMatch(/^\d+\.\d+/);
    expect(await response.json()).toEqual(getProviderData(flags));
  });

  it('returns 401 without a valid access proof', async () => {
    const response = await GET(
      new Request('https://shop.example/.well-known/vercel/flags'),
    );

    expect(response.status).toBe(401);
  });
});

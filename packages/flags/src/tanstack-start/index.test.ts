import { beforeAll, describe, expect, it } from 'vitest';
import { encryptOverrides } from '..';
import {
  createFlagsDiscoveryEndpoint,
  flag,
  generatePermutations,
  getProviderData,
  precompute,
} from '.';

const secret = 'a'.repeat(43);

beforeAll(() => {
  process.env.FLAGS_SECRET = secret;
});

describe('getProviderData', () => {
  it('is a function', () => {
    expect(typeof getProviderData).toBe('function');
  });

  it('returns definitions for the passed flags', () => {
    const first = flag<boolean>({ key: 'first-flag', decide: () => false });
    const data = getProviderData({ first });
    expect(data.definitions).toHaveProperty('first-flag');
  });
});

describe('flag', () => {
  it('defines a key', () => {
    const f = flag<boolean>({ key: 'first-flag', decide: () => false });
    expect(f).toHaveProperty('key', 'first-flag');
  });

  it('evaluates using an explicitly passed request', async () => {
    const f = flag<boolean>({ key: 'explicit-request', decide: () => true });
    const request = new Request('http://localhost/');
    await expect(f(request)).resolves.toBe(true);
  });

  it('passes headers and cookies to decide', async () => {
    const f = flag<string>({
      key: 'reads-cookie',
      decide: ({ cookies }) => cookies.get('country')?.value ?? 'unknown',
    });
    const request = new Request('http://localhost/', {
      headers: { cookie: 'country=US' },
    });
    await expect(f(request)).resolves.toBe('US');
  });

  it('deduplicates decide calls within the same request', async () => {
    let calls = 0;
    const f = flag<number>({
      key: 'dedupe',
      decide: () => ++calls,
    });
    const request = new Request('http://localhost/');
    const [a, b] = await Promise.all([f(request), f(request)]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });

  it('respects overrides from the vercel-flag-overrides cookie', async () => {
    const f = flag<boolean>({ key: 'overridable', decide: () => false });
    const override = await encryptOverrides({ overridable: true }, secret);
    const request = new Request('http://localhost/', {
      headers: { cookie: `vercel-flag-overrides=${override}` },
    });
    await expect(f(request)).resolves.toBe(true);
  });

  // Fix #1: defaultValue fallback when decide/adapter returns undefined.
  it('falls back to defaultValue when decide returns undefined', async () => {
    const f = flag<boolean>({
      key: 'undefined-decide',
      defaultValue: true,
      decide: () => undefined as unknown as boolean,
    });
    await expect(f(new Request('http://localhost/'))).resolves.toBe(true);
  });

  it('falls back to defaultValue when the adapter decide returns undefined', async () => {
    const f = flag<boolean>({
      key: 'undefined-adapter-decide',
      defaultValue: true,
      adapter: () => ({ decide: () => undefined as unknown as boolean }),
    });
    await expect(f(new Request('http://localhost/'))).resolves.toBe(true);
  });

  // Fix #2: a plain decide flag must evaluate without FLAGS_SECRET; the secret
  // is only required to decrypt an overrides cookie.
  it('evaluates a plain decide flag without FLAGS_SECRET', async () => {
    const saved = process.env.FLAGS_SECRET;
    delete process.env.FLAGS_SECRET;
    try {
      const f = flag<boolean>({ key: 'no-secret-needed', decide: () => true });
      await expect(f(new Request('http://localhost/'))).resolves.toBe(true);
    } finally {
      process.env.FLAGS_SECRET = saved;
    }
  });

  it('throws a clear error for an overrides cookie when no secret is set', async () => {
    const saved = process.env.FLAGS_SECRET;
    delete process.env.FLAGS_SECRET;
    try {
      const f = flag<boolean>({ key: 'needs-secret', decide: () => false });
      const request = new Request('http://localhost/', {
        headers: { cookie: 'vercel-flag-overrides=anything' },
      });
      await expect(f(request)).rejects.toThrow(/No secret provided/);
    } finally {
      process.env.FLAGS_SECRET = saved;
    }
  });
});

describe('precompute', () => {
  it('serializes and reads back precomputed values', async () => {
    const flagA = flag<boolean>({ key: 'a', decide: () => true });
    const flagB = flag<boolean>({ key: 'b', decide: () => false });
    const flags = [flagA, flagB] as const;
    const request = new Request('http://localhost/');

    const code = await precompute(flags, request);

    await expect(flagA(code, flags)).resolves.toBe(true);
    await expect(flagB(code, flags)).resolves.toBe(false);
  });
});

describe('generatePermutations', () => {
  it('generates one code per boolean permutation', async () => {
    const flagA = flag<boolean>({ key: 'a', decide: () => false });
    const flagB = flag<boolean>({ key: 'b', decide: () => false });
    const permutations = await generatePermutations([flagA, flagB]);
    expect(permutations).toHaveLength(4);
  });
});

describe('createFlagsDiscoveryEndpoint', () => {
  it('returns 401 when the request is not authorized', async () => {
    const handler = createFlagsDiscoveryEndpoint(() => ({
      definitions: {},
      hints: [],
    }));
    const response = await handler({
      request: new Request('http://localhost/.well-known/vercel/flags'),
    });
    expect(response.status).toBe(401);
  });
});

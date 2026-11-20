import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deserialize,
  flag,
  generatePermutations,
  getPrecomputed,
  serialize,
} from './index';

const flagA = flag<boolean>({ key: 'a', decide: () => false });
const group = [flagA];

beforeEach(() => {
  vi.stubEnv('FLAGS_SECRET', '');
  vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('precompute without FLAGS_SECRET', () => {
  it('signs and reads codes with the key of the deployment', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-a');

    // the build and the middleware create the same code
    const [codeFalse, codeTrue] = await generatePermutations(group);
    await expect(serialize(group, [true])).resolves.toBe(codeTrue);

    await expect(deserialize(group, codeFalse as string)).resolves.toEqual({
      a: false,
    });
    await expect(
      getPrecomputed(flagA, group, codeTrue as string),
    ).resolves.toBe(true);
  });

  it('rejects a code of another deployment', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-a');
    const code = await serialize(group, [true]);

    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-b');
    await expect(deserialize(group, code)).rejects.toThrow();
  });

  it('prefers a passed secret, FLAGS_SECRET, then FLAGS_PRECOMPUTE_SECRET', async () => {
    const passed = 'a'.repeat(43);
    const precomputeSecret = 'b'.repeat(43);
    const flagsSecret = 'c'.repeat(43);

    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-a');
    const withDeploymentKey = await serialize(group, [true]);

    vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', precomputeSecret);
    const withPrecomputeSecret = await serialize(group, [true]);
    expect(withPrecomputeSecret).not.toBe(withDeploymentKey);
    expect(withPrecomputeSecret).toBe(
      await serialize(group, [true], precomputeSecret),
    );

    vi.stubEnv('FLAGS_SECRET', flagsSecret);
    const withFlagsSecret = await serialize(group, [true]);
    expect(withFlagsSecret).not.toBe(withPrecomputeSecret);
    expect(withFlagsSecret).toBe(await serialize(group, [true], flagsSecret));
    await expect(generatePermutations(group)).resolves.toContain(
      withFlagsSecret,
    );
    await expect(getPrecomputed(flagA, group, withFlagsSecret)).resolves.toBe(
      true,
    );

    expect(await serialize(group, [true], passed)).not.toBe(withFlagsSecret);
  });

  it('throws outside of Vercel without the OIDC token of vercel env pull', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');

    await expect(generatePermutations(group)).rejects.toThrow(
      'vercel env pull',
    );
  });

  it('signs and reads codes with a public secret in local development', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', '');
    vi.stubEnv('VERCEL', '');
    // The OIDC token of `vercel env pull`, which is only decoded
    vi.stubEnv(
      'VERCEL_OIDC_TOKEN',
      `e30.${Buffer.from(JSON.stringify({ environment: 'development' })).toString('base64url')}.signature`,
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const [codeFalse, codeTrue] = await generatePermutations(group);
    await expect(serialize(group, [true])).resolves.toBe(codeTrue);
    await expect(
      getPrecomputed(flagA, group, codeFalse as string),
    ).resolves.toBe(false);
  });

  it('throws on Vercel when there is no key of the deployment either', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', '');
    vi.stubEnv('VERCEL', '1');

    await expect(serialize(group, [true])).rejects.toThrow('missing secret');
    await expect(generatePermutations(group)).rejects.toThrow(
      'without a secret',
    );
  });
});

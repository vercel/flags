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

  it('prefers a passed secret, FLAGS_PRECOMPUTE_SECRET, then FLAGS_SECRET', async () => {
    const passed = 'a'.repeat(43);
    const precomputeSecret = 'b'.repeat(43);
    const flagsSecret = 'c'.repeat(43);

    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-a');
    const withDeploymentKey = await serialize(group, [true]);

    vi.stubEnv('FLAGS_SECRET', flagsSecret);
    const withFlagsSecret = await serialize(group, [true]);
    expect(withFlagsSecret).not.toBe(withDeploymentKey);
    expect(withFlagsSecret).toBe(await serialize(group, [true], flagsSecret));

    vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', precomputeSecret);
    const withPrecomputeSecret = await serialize(group, [true]);
    expect(withPrecomputeSecret).toBe(
      await serialize(group, [true], precomputeSecret),
    );
    await expect(generatePermutations(group)).resolves.toContain(
      withPrecomputeSecret,
    );
    await expect(
      getPrecomputed(flagA, group, withPrecomputeSecret),
    ).resolves.toBe(true);

    expect(await serialize(group, [true], passed)).not.toBe(
      withPrecomputeSecret,
    );
  });

  it('throws when there is no key of the deployment either', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', '');

    await expect(serialize(group, [true])).rejects.toThrow('missing secret');
    await expect(generatePermutations(group)).rejects.toThrow(
      'without a secret',
    );
  });
});

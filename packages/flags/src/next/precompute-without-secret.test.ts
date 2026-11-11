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

  it('prefers FLAGS_SECRET', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-a');
    const withDeploymentKey = await serialize(group, [true]);

    vi.stubEnv('FLAGS_SECRET', 'a'.repeat(43));
    await expect(serialize(group, [true])).resolves.not.toBe(withDeploymentKey);
  });

  it('throws when there is no key of the deployment either', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', '');

    await expect(serialize(group, [true])).rejects.toThrow('missing secret');
    await expect(generatePermutations(group)).rejects.toThrow(
      'without a secret',
    );
  });
});

import { base64url } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deploymentPrecomputeSecret,
  precomputeSecretOrThrow,
} from './precompute-secret';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('deploymentPrecomputeSecret', () => {
  it('returns undefined without VERCEL_DEPLOYMENT_KEY', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', '');
    await expect(deploymentPrecomputeSecret()).resolves.toBeUndefined();
  });

  it('derives the same 32 bytes for the same deployment key', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-a');
    const secret = await deploymentPrecomputeSecret();
    expect(base64url.decode(secret as string)).toHaveLength(32);
    await expect(deploymentPrecomputeSecret()).resolves.toBe(secret);
  });

  it('does not return the deployment key itself', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-a');
    await expect(deploymentPrecomputeSecret()).resolves.not.toBe(
      'key-of-deployment-a',
    );
  });

  it('derives a different secret for another deployment key', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-a');
    const a = await deploymentPrecomputeSecret();
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-b');
    await expect(deploymentPrecomputeSecret()).resolves.not.toBe(a);
  });
});

describe('precomputeSecretOrThrow', () => {
  it('prefers the given secret', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-a');
    await expect(precomputeSecretOrThrow('given', 'missing')).resolves.toBe(
      'given',
    );
  });

  it('throws the message when there is no secret at all', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', '');
    await expect(precomputeSecretOrThrow(undefined, 'missing')).rejects.toThrow(
      'missing',
    );
  });
});

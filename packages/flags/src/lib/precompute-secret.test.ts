import { base64url } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deploymentPrecomputeSecret,
  precomputeSecretOrThrow,
} from './precompute-secret';

const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('VERCEL_DEPLOYMENT_KEY', '');
  vi.stubEnv('FLAGS_SECRET', '');
  vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', '');
  warn.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(globalThis, REQUEST_CONTEXT);
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

  it('uses a public secret outside of Vercel', async () => {
    const secret = await precomputeSecretOrThrow(undefined, 'missing');
    expect(base64url.decode(secret)).toHaveLength(32);
    await expect(precomputeSecretOrThrow(undefined, 'missing')).resolves.toBe(
      secret,
    );
  });

  it('warns one time when it uses the public secret in production', async () => {
    vi.resetModules();
    const fresh = await import('./precompute-secret');
    vi.stubEnv('NODE_ENV', 'production');
    await fresh.precomputeSecretOrThrow(undefined, 'missing');
    await fresh.precomputeSecretOrThrow(undefined, 'missing');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('FLAGS_SECRET'));
  });

  it('does not warn in development', async () => {
    vi.resetModules();
    const fresh = await import('./precompute-secret');
    vi.stubEnv('NODE_ENV', 'development');
    await fresh.precomputeSecretOrThrow(undefined, 'missing');
    expect(warn).not.toHaveBeenCalled();
  });

  it('prefers the key of the deployment over the public secret', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-a');
    await expect(precomputeSecretOrThrow(undefined, 'missing')).resolves.toBe(
      await deploymentPrecomputeSecret(),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws on Vercel without any secret', async () => {
    vi.stubEnv('VERCEL', '1');
    await expect(precomputeSecretOrThrow(undefined, 'missing')).rejects.toThrow(
      'missing',
    );
  });

  it('throws in a deployment which does not expose the system environment variables', async () => {
    Reflect.set(globalThis, REQUEST_CONTEXT, { get: () => ({}) });
    await expect(precomputeSecretOrThrow(undefined, 'missing')).rejects.toThrow(
      'missing',
    );
  });
});

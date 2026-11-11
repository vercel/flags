import type { RequestEvent } from '@sveltejs/kit';
import {
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFlagOverridesKeys } from '../lib/flag-overrides-platform';
import { createHandle, decryptOverrides, encryptFlagValues, flag } from '.';

vi.hoisted(() => {
  delete process.env.FLAGS_SECRET;
});

// During `vite dev`, the variables of `.env.local` are only in `$env`
vi.mock('$env/static/private', () => {
  const claims = Buffer.from(
    JSON.stringify({ project_id: 'prj_env', environment: 'development' }),
  );
  return {
    FLAGS_SECRET: undefined,
    VERCEL_OIDC_TOKEN: `e30.${claims.toString('base64url')}.x`,
  };
});

beforeEach(() => {
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('VERCEL_PROJECT_ID', '');
  vi.stubEnv('VERCEL_TARGET_ENV', '');
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('VERCEL_OIDC_TOKEN', '');
  vi.spyOn(process, 'cwd').mockReturnValue('/nonexistent');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SvelteKit with variables which are only in $env', () => {
  it('takes the project ID from the OIDC token of vercel env pull', async () => {
    const { publicKey } = await generateKeyPair('ECDH-ES', {
      extractable: true,
    });
    const jwk = { ...(await exportJWK(publicKey)), kid: 'key-1' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ keys: [jwk] })),
    );

    const token = await encryptFlagValues({ 'summer-sale': true });

    expect(decodeProtectedHeader(token)).toMatchObject({
      projectIds: ['prj_env'],
    });
  });

  it('accepts overrides which Vercel signs after vercel env pull', async () => {
    resetFlagOverridesKeys();
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k', alg: 'ES256' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ keys: [jwk] })),
    );
    const token = await new SignJWT({
      ver: 1,
      pur: 'flag-overrides',
      scope: { projectIds: ['prj_env'], environments: ['development'] },
      overrides: { 'summer-sale': false },
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'k' })
      .setIssuer('https://kms.vercel.com/64af96a2-ba60-42ef-91af-459fcef6f864')
      .setAudience('vercel:flag-overrides')
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(privateKey);

    // A secret in the options must not skip the load of `$env`
    const summerSale = flag<boolean>({
      key: 'summer-sale',
      decide: () => true,
    });
    let value: boolean | undefined;
    const handle = createHandle({
      secret: 'a'.repeat(43),
      flags: { summerSale },
    });
    await handle({
      event: {
        request: new Request('https://shop.example/', {
          headers: { cookie: `vercel-flag-overrides=${token}` },
        }),
        params: {},
      } as unknown as RequestEvent,
      resolve: async () => {
        value = await summerSale();
        return new Response('page');
      },
    });

    expect(value).toBe(false);
    await expect(decryptOverrides(token)).resolves.toEqual({
      'summer-sale': false,
    });
  });
});

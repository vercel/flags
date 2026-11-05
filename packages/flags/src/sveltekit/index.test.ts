import crypto from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptOverrides } from '..';
import { resetVercelKeys } from '../lib/vercel-overrides';
import { createHandle, flag, getProviderData } from '.';

vi.mock('$env/dynamic/private', () => ({ FLAGS_SECRET: 'secret' }));

describe('getProviderData', () => {
  it('is a function', () => {
    expect(typeof getProviderData).toBe('function');
  });
});

describe('flag', () => {
  it('defines a key', async () => {
    const f = flag<boolean>({ key: 'first-flag', decide: () => false });
    expect(f).toHaveProperty('key', 'first-flag');
  });
});

describe('overrides', () => {
  const secret = crypto.randomBytes(32).toString('base64url');

  async function evaluateWithCookie(cookie: string) {
    const decide = vi.fn(() => 'decided');
    const f = flag<string>({ key: 'first-flag', decide });
    const handle = createHandle({ secret });
    let value: string | undefined;
    await handle({
      event: {
        request: new Request('https://example.com', { headers: { cookie } }),
        params: {},
      } as any,
      resolve: (async () => {
        value = await f();
        return new Response('ok');
      }) as any,
    });
    return { value, decide };
  }

  it('reads the vercel-flag-overrides cookie', async () => {
    const token = await encryptOverrides({ 'first-flag': 'old' }, secret);
    const { value, decide } = await evaluateWithCookie(
      `vercel-flag-overrides=${token}`,
    );
    expect(value).toBe('old');
    expect(decide).not.toHaveBeenCalled();
  });

  describe('with a token which Vercel signs', () => {
    afterEach(() => {
      resetVercelKeys();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    async function signedToken() {
      const { privateKey, publicKey } = await generateKeyPair('ES256');
      const jwk = { ...(await exportJWK(publicKey)), kid: 'k', alg: 'ES256' };
      const fetch = vi.fn(
        async () => new Response(JSON.stringify({ keys: [jwk] })),
      );
      vi.stubGlobal('fetch', fetch);
      resetVercelKeys();
      const token = await new SignJWT({
        ver: 1,
        pur: 'flag-overrides',
        scope: { projectIds: ['prj_1'], environments: ['preview'] },
        overrides: { 'first-flag': 'signed' },
      })
        .setProtectedHeader({ alg: 'ES256', kid: 'k' })
        .setIssuer(
          'https://kms.vercel.com/64af96a2-ba60-42ef-91af-459fcef6f864',
        )
        .setAudience('vercel:flag-overrides')
        .setIssuedAt()
        .setExpirationTime('2m')
        .sign(privateKey);
      return { token, fetch };
    }

    it('accepts the token on Vercel, even with a secret', async () => {
      vi.stubEnv('VERCEL', '1');
      vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1');
      vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
      vi.stubEnv('VERCEL_OIDC_TOKEN', '');
      const { token, fetch } = await signedToken();

      const { value, decide } = await evaluateWithCookie(
        `vercel-flag-overrides=${token}`,
      );
      expect(value).toBe('signed');
      expect(decide).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('ignores the token outside of Vercel', async () => {
      vi.stubEnv('VERCEL', '');
      vi.stubEnv('VERCEL_OIDC_TOKEN', '');
      const { token, fetch } = await signedToken();

      const { value, decide } = await evaluateWithCookie(
        `vercel-flag-overrides=${token}`,
      );
      expect(value).toBe('decided');
      expect(decide).toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});

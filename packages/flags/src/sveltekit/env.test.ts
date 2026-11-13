import { decodeProtectedHeader, exportJWK, generateKeyPair } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptFlagValues } from '.';

vi.hoisted(() => {
  delete process.env.FLAGS_SECRET;
});

// During `vite dev`, the variables of `.env.local` are only in `$env`
vi.mock('$env/static/private', () => ({ FLAGS_SECRET: undefined }));
vi.mock('$env/dynamic/private', () => {
  const claims = Buffer.from(JSON.stringify({ project_id: 'prj_env' }));
  return {
    env: { VERCEL_OIDC_TOKEN: `e30.${claims.toString('base64url')}.x` },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SvelteKit with variables which are only in $env', () => {
  it('takes the project ID from the OIDC token of vercel env pull', async () => {
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');
    vi.spyOn(process, 'cwd').mockReturnValue('/nonexistent');
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
});

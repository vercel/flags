import { createAccessProof } from 'flags';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFlagsDiscoveryEndpoint } from './create-flags-discovery-endpoint';

// The issuer of the tokens of the Flags Discovery Endpoint in Vercel KMS
const VERCEL_FLAGS_DISCOVERY_ISSUER =
  'https://kms.vercel.com/d0efbb30-566d-48b6-b173-0062e54ec49c';

describe('createFlagsDiscoveryEndpoint without FLAGS_SECRET', () => {
  const secret = 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc';
  const endpoint = createFlagsDiscoveryEndpoint(() => ({ definitions: {} }));
  const request = (authorization?: string) =>
    new Request('https://shop.example/.well-known/vercel/flags', {
      headers: authorization ? { authorization } : {},
    }) as unknown as NextRequest;
  let token: string;

  beforeAll(async () => {
    vi.stubEnv('FLAGS_SECRET', '');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1');
    vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k', alg: 'ES256' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ keys: [jwk] })),
    );
    token = await new SignJWT({
      ver: 1,
      pur: 'flags-discovery',
      scope: { projectIds: ['prj_1'], environments: ['preview'] },
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'k' })
      .setIssuer(VERCEL_FLAGS_DISCOVERY_ISSUER)
      .setAudience('vercel:flags-discovery')
      .setIssuedAt()
      .setExpirationTime('1m')
      .sign(privateKey);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('responds with the data for a token which Vercel signs', async () => {
    const response = await endpoint(request(`Bearer ${token}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ definitions: {} });
  });

  it('responds with 401 for an invalid token, a proof, or no header', async () => {
    for (const authorization of [
      `Bearer ${token}x`,
      `Bearer ${await createAccessProof(secret)}`,
      undefined,
    ]) {
      expect((await endpoint(request(authorization))).status).toBe(401);
    }
  });
});

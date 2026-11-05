import type { RequestEvent } from '@sveltejs/kit';
import {
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFlagValuesKeys } from '../lib/flag-values-platform';
import { resetVercelKeys } from '../lib/vercel-overrides';
import {
  createFlagsDiscoveryEndpoint,
  createHandle,
  encryptFlagValues,
  flag,
} from '.';

const FLAGS_KEYS_ISSUER = vi.hoisted(() => {
  delete process.env.FLAGS_SECRET;
  return 'https://kms.vercel.com/00000000-0000-4000-8000-000000000001';
});

// The id of the flags-keys-issuer is not known yet
vi.mock('../lib/vercel-overrides', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/vercel-overrides')>()),
  FLAGS_KEYS_ISSUER,
}));

const summerSale = flag<boolean>({ key: 'summer-sale', decide: () => true });

function event(path: string) {
  return {
    request: new Request(`https://shop.example${path}`),
    params: {},
  } as unknown as RequestEvent;
}

beforeEach(async () => {
  resetFlagValuesKeys();
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_shop');
  const { publicKey } = await generateKeyPair('ECDH-ES', {
    extractable: true,
  });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'key-1' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ keys: [jwk] })),
  );
});

/**
 * Signs a token like Vercel KMS, with a key which the mocked fetch serves.
 */
async function signWithVercelKey(
  claims: Record<string, unknown>,
  issuer = 'https://kms.vercel.com/64af96a2-ba60-42ef-91af-459fcef6f864',
) {
  resetVercelKeys();
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k', alg: 'ES256' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ keys: [jwk] })),
  );
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: 'k' })
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(privateKey);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('SvelteKit without FLAGS_SECRET', () => {
  it('encrypts the used flag values with the public key of Vercel', async () => {
    const handle = createHandle({ flags: { summerSale } });
    const response = await handle({
      event: event('/'),
      resolve: async (_event, options) => {
        await summerSale();
        const html = await options?.transformPageChunk?.({
          html: '<body></body>',
          done: true,
        });
        return new Response(html);
      },
    });

    const html = await response.text();
    const token = JSON.parse(
      html.match(/data-flag-values>(.*)<\/script>/)?.[1] ?? 'null',
    );
    expect(decodeProtectedHeader(token)).toMatchObject({
      alg: 'ECDH-ES',
      projectIds: ['prj_shop'],
    });
  });

  it('does not serve the flags discovery endpoint without a token', async () => {
    const handle = createHandle({ flags: { summerSale } });
    const response = await handle({
      event: event('/.well-known/vercel/flags'),
      resolve: async () => new Response('page'),
    });

    expect(response.status).toBe(401);
  });

  it('serves the flags discovery endpoint for a token which Vercel signs', async () => {
    const authorization = `Bearer ${await signWithVercelKey(
      {
        ver: 1,
        pur: 'flags-discovery',
        aud: 'vercel:flags-discovery',
        scope: { projectId: 'prj_shop', environments: ['preview'] },
      },
      FLAGS_KEYS_ISSUER,
    )}`;
    const withToken = {
      request: new Request('https://shop.example/.well-known/vercel/flags', {
        headers: { authorization },
      }),
      params: {},
    } as unknown as RequestEvent;

    const handle = createHandle({ flags: { summerSale } });
    const response = await handle({
      event: withToken,
      resolve: async () => new Response('page'),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toHaveProperty(
      'definitions.summer-sale',
    );

    const endpoint = createFlagsDiscoveryEndpoint(() => ({ definitions: {} }));
    const endpointResponse = await endpoint(withToken as never);
    expect(endpointResponse.status).toBe(200);
    await expect(
      endpoint(event('/.well-known/vercel/flags') as never),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('encrypts with the public key of Vercel', async () => {
    const token = await encryptFlagValues({ 'summer-sale': true });

    expect(decodeProtectedHeader(token).alg).toBe('ECDH-ES');
  });

  it('accepts overrides which Vercel signs', async () => {
    const token = await signWithVercelKey({
      ver: 1,
      pur: 'flag-overrides',
      aud: 'vercel:flag-overrides',
      scope: { projectId: 'prj_shop', environments: ['preview'] },
      overrides: { 'summer-sale': false },
    });

    let value: boolean | undefined;
    const handle = createHandle({ flags: { summerSale } });
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
  });
});

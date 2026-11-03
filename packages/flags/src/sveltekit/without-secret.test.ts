import type { RequestEvent } from '@sveltejs/kit';
import { decodeProtectedHeader, exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFlagValuesKeys } from '../lib/flag-values-platform';
import { createHandle, encryptFlagValues, flag } from '.';

vi.hoisted(() => {
  delete process.env.FLAGS_SECRET;
});

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

  it('does not serve the flags discovery endpoint', async () => {
    const handle = createHandle({ flags: { summerSale } });
    const response = await handle({
      event: event('/.well-known/vercel/flags'),
      resolve: async () => new Response('page'),
    });

    expect(response.status).toBe(401);
  });

  it('encrypts with the public key of Vercel', async () => {
    const token = await encryptFlagValues({ 'summer-sale': true });

    expect(decodeProtectedHeader(token).alg).toBe('ECDH-ES');
  });
});

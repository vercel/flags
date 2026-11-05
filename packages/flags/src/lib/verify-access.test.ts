import {
  base64url,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
  SignJWT,
} from 'jose';
import type { NextRequest } from 'next/server';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createFlagsDiscoveryEndpoint } from '../next/create-flags-discovery-endpoint';
import { createAccessProof } from './crypto';
import {
  resetVercelKeys,
  verifyVercelSignedOverrides,
  verifyVercelSignedToken,
} from './vercel-overrides';
import { verifyAccess } from './verify-access';

const ISSUER = vi.hoisted(
  () => 'https://kms.vercel.com/00000000-0000-4000-8000-000000000001',
);
const OVERRIDES_ISSUER =
  'https://kms.vercel.com/64af96a2-ba60-42ef-91af-459fcef6f864';

// The id of the flags-keys-issuer is not known yet, see FLAGS_KEYS_ISSUER
vi.mock('./vercel-overrides', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./vercel-overrides')>()),
  FLAGS_KEYS_ISSUER: ISSUER,
}));
const secret = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));

let privateKey: KeyLike;
let otherKey: KeyLike;
let publicJwk: JWK;
let fetchKeys: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  publicJwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'key-1',
    alg: 'ES256',
  };
  otherKey = (await generateKeyPair('ES256')).privateKey;
});

beforeEach(() => {
  resetVercelKeys();
  for (const name of ['FLAGS_SECRET', 'VERCEL_OIDC_TOKEN', 'VERCEL_ENV']) {
    vi.stubEnv(name, '');
  }
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1');
  vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
  fetchKeys = vi.fn(
    async () => new Response(JSON.stringify({ keys: [publicJwk] })),
  );
  vi.stubGlobal('fetch', fetchKeys);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function sign(
  claims: Record<string, unknown> = {},
  options: {
    alg?: string;
    header?: Record<string, unknown>;
    key?: KeyLike | Uint8Array;
    issuer?: string;
    audience?: string;
    lifetime?: number;
    issuedAt?: number;
  } = {},
) {
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
  return new SignJWT({
    pur: 'flags-discovery',
    ver: 1,
    scope: {
      teamId: 'team_1',
      projectIds: ['prj_1'],
      environments: ['preview'],
    },
    ...claims,
  })
    .setProtectedHeader({
      alg: options.alg ?? 'ES256',
      kid: 'key-1',
      ...options.header,
    })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? 'vercel:flags-discovery')
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + (options.lifetime ?? 60))
    .sign(options.key ?? privateKey);
}

function signOverrides(issuer = OVERRIDES_ISSUER) {
  return sign(
    { pur: 'flag-overrides', overrides: { a: true } },
    { audience: 'vercel:flag-overrides', issuer },
  );
}

describe('verifyAccess with a token which Vercel signs', () => {
  it('accepts a valid token without FLAGS_SECRET', async () => {
    await expect(verifyAccess(`Bearer ${await sign()}`)).resolves.toBe(true);
    expect(String(fetchKeys.mock.calls[0]?.[0])).toBe(`${ISSUER}/jwks.json`);
  });

  it('accepts a valid token with FLAGS_SECRET set', async () => {
    await expect(verifyAccess(await sign(), secret)).resolves.toBe(true);
  });

  it.each([
    [
      'an expired token',
      () =>
        sign(
          {},
          { issuedAt: Math.floor(Date.now() / 1000) - 600, lifetime: 60 },
        ),
    ],
    ['a lifetime above 300 seconds', () => sign({}, { lifetime: 301 })],
    [
      'a different issuer',
      () => sign({}, { issuer: 'https://kms.vercel.com/other' }),
    ],
    ['a different audience', () => sign({}, { audience: 'vercel:other' })],
    ['a different purpose', () => sign({ pur: 'proof' })],
    ['a different version', () => sign({ ver: 2 })],
    ['a signature of a different key', () => sign({}, { key: otherKey })],
    [
      'an HS256 token',
      () => sign({}, { alg: 'HS256', key: base64url.decode(secret) }),
    ],
    ['a key in the header', () => sign({}, { header: { jwk: publicJwk } })],
    ['a key URL in the header', () => sign({}, { header: { jku: '' } })],
    ['an overrides token', () => signOverrides()],
    [
      'a discovery token of the overrides issuer',
      () => sign({}, { issuer: OVERRIDES_ISSUER }),
    ],
    [
      'a different project',
      () =>
        sign({
          scope: {
            teamId: 'team_1',
            projectIds: ['prj_2'],
            environments: ['preview'],
          },
        }),
    ],
    [
      'a different environment',
      () =>
        sign({
          scope: {
            teamId: 'team_1',
            projectIds: ['prj_1'],
            environments: ['production'],
          },
        }),
    ],
    [
      'an unknown key in the scope',
      () =>
        sign({
          scope: {
            teamId: 'team_1',
            projectIds: ['prj_1'],
            environments: ['preview'],
            deploymentId: 'dpl_1',
          },
        }),
    ],
  ])('rejects %s', async (_, token) => {
    await expect(verifyAccess(await token(), secret)).resolves.toBe(false);
  });

  it('rejects a different team when the team is known', async () => {
    vi.stubEnv(
      'VERCEL_OIDC_TOKEN',
      await new SignJWT({ owner_id: 'team_2' })
        .setProtectedHeader({ alg: 'ES256' })
        .sign(otherKey),
    );
    await expect(verifyAccess(await sign())).resolves.toBe(false);
  });

  it('rejects tokens when the project is not known', async () => {
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    await expect(verifyAccess(await sign())).resolves.toBe(false);
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it('does not accept a discovery token as overrides', async () => {
    await expect(
      signOverrides().then(verifyVercelSignedOverrides),
    ).resolves.toBeDefined();
    await expect(
      verifyVercelSignedOverrides(await sign({ overrides: { a: true } })),
    ).resolves.toBeUndefined();
  });

  it('does not accept overrides of the flags-keys issuer', async () => {
    await expect(
      verifyVercelSignedOverrides(await signOverrides(ISSUER)),
    ).resolves.toBeUndefined();
  });

  it('loads the keys of each issuer from its own key set', async () => {
    await expect(verifyAccess(await sign())).resolves.toBe(true);
    await expect(
      signOverrides().then(verifyVercelSignedOverrides),
    ).resolves.toBeDefined();
    expect(fetchKeys.mock.calls.map(([url]) => String(url))).toEqual([
      `${ISSUER}/jwks.json`,
      `${OVERRIDES_ISSUER}/jwks.json`,
    ]);
  });

  it('rejects all tokens while the flags-keys issuer is a placeholder', async () => {
    const { FLAGS_KEYS_ISSUER: placeholder } =
      await vi.importActual<typeof import('./vercel-overrides')>(
        './vercel-overrides',
      );
    expect(placeholder).toContain('TODO');
    for (const issuer of [placeholder, '', 'https://kms.vercel.com/']) {
      await expect(
        verifyVercelSignedToken(await sign({}, { issuer }), {
          issuer,
          audience: 'vercel:flags-discovery',
          purpose: 'flags-discovery',
          maxLifetimeSeconds: 300,
        }),
      ).resolves.toBeUndefined();
    }
    expect(fetchKeys).not.toHaveBeenCalled();
  });
});

describe('verifyAccess with a proof encrypted with FLAGS_SECRET', () => {
  it('accepts a valid proof like before', async () => {
    const proof = await createAccessProof(secret);
    await expect(verifyAccess(`Bearer ${proof}`, secret)).resolves.toBe(true);
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it('reads FLAGS_SECRET by default', async () => {
    vi.stubEnv('FLAGS_SECRET', secret);
    await expect(verifyAccess(await createAccessProof(secret))).resolves.toBe(
      true,
    );
  });

  it('rejects a proof of a different secret', async () => {
    const other = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
    await expect(
      verifyAccess(await createAccessProof(other), secret),
    ).resolves.toBe(false);
  });

  it('returns false instead of throwing without a secret', async () => {
    await expect(verifyAccess(await createAccessProof(secret))).resolves.toBe(
      false,
    );
  });

  it('returns false without a header', async () => {
    await expect(verifyAccess(null, secret)).resolves.toBe(false);
  });
});

describe('createFlagsDiscoveryEndpoint without FLAGS_SECRET', () => {
  const endpoint = createFlagsDiscoveryEndpoint(() => ({ definitions: {} }));
  const request = (authorization?: string) =>
    new Request('https://shop.example/.well-known/vercel/flags', {
      headers: authorization ? { authorization } : {},
    }) as unknown as NextRequest;

  it('responds with the data for a token which Vercel signs', async () => {
    const response = await endpoint(request(`Bearer ${await sign()}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ definitions: {} });
  });

  it('responds with 401 for an invalid token, a proof, or no header', async () => {
    for (const authorization of [
      `Bearer ${await signOverrides()}`,
      `Bearer ${await createAccessProof(secret)}`,
      undefined,
    ]) {
      expect((await endpoint(request(authorization))).status).toBe(401);
    }
  });
});

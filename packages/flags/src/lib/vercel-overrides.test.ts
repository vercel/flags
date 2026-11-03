import {
  base64url,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
  SignJWT,
} from 'jose';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { getOverrides } from '../next/overrides';
import { encryptOverrides } from './crypto';
import {
  isVercelSignedToken,
  resetVercelKeys,
  verifyVercelSignedOverrides,
} from './vercel-overrides';

const ISSUER = 'https://kms.vercel.com/64af96a2-ba60-42ef-91af-459fcef6f864';
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
  vi.useRealTimers();
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
    pur: 'flag-overrides',
    ver: 1,
    scope: { teamId: 'team_1', projectId: 'prj_1', environments: ['preview'] },
    overrides: { 'new-checkout': true },
    ...claims,
  })
    .setProtectedHeader({
      alg: options.alg ?? 'ES256',
      kid: 'key-1',
      ...options.header,
    })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? 'vercel:flag-overrides')
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + (options.lifetime ?? 120))
    .sign(options.key ?? privateKey);
}

describe('verifyVercelSignedOverrides', () => {
  it('returns the overrides of a valid token', async () => {
    await expect(verifyVercelSignedOverrides(await sign())).resolves.toEqual({
      'new-checkout': true,
    });
    expect(String(fetchKeys.mock.calls[0]?.[0])).toBe(`${ISSUER}/jwks.json`);
  });

  it('loads the public keys once, not per token', async () => {
    const token = await sign();
    await Promise.all([
      verifyVercelSignedOverrides(token),
      verifyVercelSignedOverrides(token),
    ]);
    await verifyVercelSignedOverrides(await sign({ overrides: { a: 1 } }));
    expect(fetchKeys).toHaveBeenCalledTimes(1);
  });

  it('reads the project from the VERCEL_OIDC_TOKEN of vercel env pull', async () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    vi.stubEnv('VERCEL_TARGET_ENV', '');
    vi.stubEnv(
      'VERCEL_OIDC_TOKEN',
      await new SignJWT({
        project_id: 'prj_1',
        environment: 'preview',
        owner_id: 'team_1',
      })
        .setProtectedHeader({ alg: 'ES256' })
        .sign(otherKey),
    );
    await expect(verifyVercelSignedOverrides(await sign())).resolves.toEqual({
      'new-checkout': true,
    });
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
    [
      'a lifetime above 24 hours',
      () => sign({}, { lifetime: 24 * 60 * 60 + 1 }),
    ],
    [
      'a different issuer',
      () => sign({}, { issuer: 'https://kms.vercel.com/other' }),
    ],
    ['a different audience', () => sign({}, { audience: 'vercel:other' })],
    ['a different purpose', () => sign({ pur: 'overrides' })],
    ['a different version', () => sign({ ver: 2 })],
    ['overrides which are not an object', () => sign({ overrides: ['a'] })],
    ['a signature of a different key', () => sign({}, { key: otherKey })],
    [
      'an HS256 token',
      () => sign({}, { alg: 'HS256', key: base64url.decode(secret) }),
    ],
    ['a key in the header', () => sign({}, { header: { jwk: publicJwk } })],
    [
      'a key URL in the header, even when empty',
      () => sign({}, { header: { jku: '' } }),
    ],
    [
      'a key which the issuer does not have',
      () => sign({}, { header: { kid: 'key-2' } }),
    ],
    [
      'a different project',
      () =>
        sign({
          scope: {
            teamId: 'team_1',
            projectId: 'prj_2',
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
            projectId: 'prj_1',
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
            projectId: 'prj_1',
            environments: ['preview'],
            deploymentId: 'dpl_1',
          },
        }),
    ],
  ])('rejects %s', async (_, token) => {
    await expect(
      verifyVercelSignedOverrides(await token()),
    ).resolves.toBeUndefined();
  });

  it('rejects an unsigned token', async () => {
    const part = (value: object) => base64url.encode(JSON.stringify(value));
    await expect(
      verifyVercelSignedOverrides(
        `${part({ alg: 'none', kid: 'key-1' })}.${part({})}.`,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects a different team when the team is known', async () => {
    vi.stubEnv(
      'VERCEL_OIDC_TOKEN',
      await new SignJWT({ owner_id: 'team_2' })
        .setProtectedHeader({ alg: 'ES256' })
        .sign(otherKey),
    );
    await expect(
      verifyVercelSignedOverrides(await sign()),
    ).resolves.toBeUndefined();
  });

  it('rejects tokens when the project is not known', async () => {
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    await expect(
      verifyVercelSignedOverrides(await sign()),
    ).resolves.toBeUndefined();
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it('loads the keys again for a new key, but not more often than every 30 seconds', async () => {
    vi.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
    await verifyVercelSignedOverrides(await sign());
    const unknown = await sign({}, { header: { kid: 'key-2' } });

    await verifyVercelSignedOverrides(unknown);
    await verifyVercelSignedOverrides(unknown);
    expect(fetchKeys).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    await verifyVercelSignedOverrides(unknown);
    expect(fetchKeys).toHaveBeenCalledTimes(2);
  });

  it('ignores tokens while the keys can not be loaded, and retries after 30 seconds', async () => {
    vi.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
    fetchKeys.mockResolvedValueOnce(new Response('error', { status: 500 }));
    const token = await sign();

    await expect(verifyVercelSignedOverrides(token)).resolves.toBeUndefined();
    await expect(verifyVercelSignedOverrides(token)).resolves.toBeUndefined();
    expect(fetchKeys).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    await expect(verifyVercelSignedOverrides(token)).resolves.toEqual({
      'new-checkout': true,
    });
  });
});

describe('isVercelSignedToken', () => {
  it('is true for a JWS on Vercel', async () => {
    expect(isVercelSignedToken(await sign())).toBe(true);
  });

  it('is false outside of Vercel', async () => {
    vi.stubEnv('VERCEL', '');
    expect(isVercelSignedToken(await sign())).toBe(false);
  });

  it('is false for a JWE', async () => {
    expect(isVercelSignedToken(await encryptOverrides({ a: 1 }, secret))).toBe(
      false,
    );
  });
});

describe('getOverrides', () => {
  it('accepts signed tokens on Vercel with FLAGS_SECRET set', async () => {
    vi.stubEnv('FLAGS_SECRET', secret);
    await expect(getOverrides(await sign())).resolves.toEqual({
      'new-checkout': true,
    });
  });

  it('decrypts FLAGS_SECRET tokens like before', async () => {
    vi.stubEnv('FLAGS_SECRET', secret);
    const token = await encryptOverrides({ a: 1 });
    await expect(getOverrides(token)).resolves.toEqual({ a: 1 });
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it('does not accept signed tokens outside of Vercel', async () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('FLAGS_SECRET', secret);
    await expect(getOverrides(await sign())).resolves.toBeNull();
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it('stops accepting a signed token when it expires', async () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const token = await sign({}, { issuedAt, lifetime: 10 });
    await expect(getOverrides(token)).resolves.toBeDefined();

    vi.useFakeTimers({ now: (issuedAt + 60) * 1000, toFake: ['Date'] });
    await expect(getOverrides(token)).resolves.toBeNull();
  });
});

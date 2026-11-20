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
import { createAccessProof } from './crypto';
import {
  resetFlagOverridesKeys,
  verifyFlagOverridesFromPlatform,
} from './flag-overrides-platform';
import {
  FLAGS_DISCOVERY_POLICY,
  VERCEL_FLAGS_DISCOVERY_ISSUER as ISSUER,
} from './flags-discovery-platform';
import { resetWarnings } from './vercel-platform';
import { verifyAccess } from './verify-access';

const OVERRIDES_ISSUER =
  'https://kms.vercel.com/64af96a2-ba60-42ef-91af-459fcef6f864';
const secret = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));

let privateKey: KeyLike;
let otherKey: KeyLike;
let publicJwk: JWK;
let fetchKeys: ReturnType<typeof vi.fn>;
let warn: ReturnType<typeof vi.spyOn>;

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
  resetFlagOverridesKeys();
  resetWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
  vi.restoreAllMocks();
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
      'a token which is too long',
      () => sign({ a: 'x'.repeat(FLAGS_DISCOVERY_POLICY.maxTokenLength) }),
    ],
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

  it('accepts only the name of a custom environment for a host in it', async () => {
    // For a custom environment, VERCEL_ENV is `preview`, and Vercel puts the
    // name of the custom environment in the scope
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'staging');
    const scope = (environment: string) => ({
      teamId: 'team_1',
      projectIds: ['prj_1'],
      environments: [environment],
    });

    await expect(
      verifyAccess(await sign({ scope: scope('staging') })),
    ).resolves.toBe(true);
    await expect(
      verifyAccess(await sign({ scope: scope('preview') })),
    ).resolves.toBe(false);
  });

  it('rejects tokens when the project is not known', async () => {
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    await expect(verifyAccess(await sign())).resolves.toBe(false);
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it('does not accept a discovery token as overrides', async () => {
    await expect(
      signOverrides().then(verifyFlagOverridesFromPlatform),
    ).resolves.toBeDefined();
    await expect(
      verifyFlagOverridesFromPlatform(await sign({ overrides: { a: true } })),
    ).resolves.toBeUndefined();
  });

  it('does not accept overrides of the flags-keys issuer', async () => {
    await expect(
      verifyFlagOverridesFromPlatform(await signOverrides(ISSUER)),
    ).resolves.toBeUndefined();
  });

  it('loads the keys of each issuer from its own key set', async () => {
    await expect(verifyAccess(await sign())).resolves.toBe(true);
    await expect(
      signOverrides().then(verifyFlagOverridesFromPlatform),
    ).resolves.toBeDefined();
    expect(fetchKeys.mock.calls.map(([url]) => String(url))).toEqual([
      `${ISSUER}/jwks.json`,
      `${OVERRIDES_ISSUER}/jwks.json`,
    ]);
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
    // The host can verify signed tokens, so the secret is not necessary
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns without a secret on a host which can not verify signed tokens', async () => {
    vi.stubEnv('VERCEL', '');
    const proof = await createAccessProof(secret);

    await expect(verifyAccess(proof)).resolves.toBe(false);
    await expect(verifyAccess(await sign())).resolves.toBe(false);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/no FLAGS_SECRET.*vercel env pull/),
    );
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it('returns false without a header', async () => {
    await expect(verifyAccess(null, secret)).resolves.toBe(false);
  });
});

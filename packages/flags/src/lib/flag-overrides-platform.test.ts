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
import { decryptOverrides, encryptOverrides } from './crypto';
import {
  FLAG_OVERRIDES_POLICY,
  isFlagOverridesFromPlatform,
  resetFlagOverridesKeys,
  signOverrides,
  VERCEL_FLAG_OVERRIDES_JWKS_URL,
  verifyFlagOverridesFromPlatform,
} from './flag-overrides-platform';
import { resetWarnings, verifyVercelSignedToken } from './vercel-platform';

const ISSUER = 'https://kms.vercel.com/64af96a2-ba60-42ef-91af-459fcef6f864';
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
  vi.useRealTimers();
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
    omit?: 'iat' | 'exp';
  } = {},
) {
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({
    pur: 'flag-overrides',
    ver: 1,
    scope: {
      teamId: 'team_1',
      projectIds: ['prj_1'],
      environments: ['preview'],
    },
    overrides: { 'new-checkout': true },
    ...claims,
  })
    .setProtectedHeader({
      alg: options.alg ?? 'ES256',
      kid: 'key-1',
      ...options.header,
    })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? 'vercel:flag-overrides');
  if (options.omit !== 'iat') {
    jwt.setIssuedAt(issuedAt);
  }
  if (options.omit !== 'exp') {
    jwt.setExpirationTime(issuedAt + (options.lifetime ?? 120));
  }
  return jwt.sign(options.key ?? privateKey);
}

describe('verifyFlagOverridesFromPlatform', () => {
  it('returns the overrides of a valid token', async () => {
    await expect(
      verifyFlagOverridesFromPlatform(await sign()),
    ).resolves.toEqual({
      'new-checkout': true,
    });
    expect(String(fetchKeys.mock.calls[0]?.[0])).toBe(
      VERCEL_FLAG_OVERRIDES_JWKS_URL,
    );
  });

  it('loads the public keys once, not per token', async () => {
    const token = await sign();
    await Promise.all([
      verifyFlagOverridesFromPlatform(token),
      verifyFlagOverridesFromPlatform(token),
    ]);
    await verifyFlagOverridesFromPlatform(await sign({ overrides: { a: 1 } }));
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
    await expect(
      verifyFlagOverridesFromPlatform(await sign()),
    ).resolves.toEqual({
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
      'a lifetime above 7 days',
      () => sign({}, { lifetime: 7 * 24 * 60 * 60 + 1 }),
    ],
    [
      'a token which is issued in the future',
      () => sign({}, { issuedAt: Math.floor(Date.now() / 1000) + 600 }),
    ],
    [
      'a token which is not valid yet',
      () => sign({ nbf: Math.floor(Date.now() / 1000) + 600 }),
    ],
    ['a token without iat', () => sign({}, { omit: 'iat' })],
    ['a token without exp', () => sign({}, { omit: 'exp' })],
    [
      'a token which is too long',
      () =>
        sign({
          overrides: { a: 'x'.repeat(FLAG_OVERRIDES_POLICY.maxTokenLength) },
        }),
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
      'a certificate URL in the header',
      () => sign({}, { header: { x5u: 'https://example.com/cert' } }),
    ],
    [
      'a critical header',
      () => sign({}, { header: { crit: ['b64'], b64: true } }),
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
    await expect(
      verifyFlagOverridesFromPlatform(await token()),
    ).resolves.toBeUndefined();
  });

  it('rejects all tokens of an issuer which is not an issuer of Vercel KMS', async () => {
    for (const issuer of [
      'https://kms.vercel.com/not-an-issuer',
      '',
      'https://kms.vercel.com/',
    ]) {
      await expect(
        verifyVercelSignedToken(
          await sign({}, { issuer }),
          issuer,
          FLAG_OVERRIDES_POLICY,
        ),
      ).resolves.toBeUndefined();
    }
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it('warns about a token for a different project, but not about an expired token', async () => {
    await verifyFlagOverridesFromPlatform(
      await sign(
        {},
        { issuedAt: Math.floor(Date.now() / 1000) - 600, lifetime: 60 },
      ),
    );
    expect(warn).not.toHaveBeenCalled();

    const token = await sign({
      scope: {
        teamId: 'team_1',
        projectIds: ['prj_2'],
        environments: ['preview'],
      },
    });
    await verifyFlagOverridesFromPlatform(token);
    await verifyFlagOverridesFromPlatform(token);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'it is not for the project prj_1 and the environment preview',
      ),
    );
  });

  it('accepts a token of all projects of a microfrontends group', async () => {
    await expect(
      verifyFlagOverridesFromPlatform(
        await sign({
          scope: {
            teamId: 'team_1',
            projectIds: ['prj_2', 'prj_1'],
            environments: ['preview'],
          },
        }),
      ),
    ).resolves.toEqual({ 'new-checkout': true });
  });

  it('rejects a single projectId', async () => {
    await expect(
      verifyFlagOverridesFromPlatform(
        await sign({
          scope: {
            teamId: 'team_1',
            projectId: 'prj_1',
            environments: ['preview'],
          },
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects an unsigned token', async () => {
    const part = (value: object) => base64url.encode(JSON.stringify(value));
    await expect(
      verifyFlagOverridesFromPlatform(
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
      verifyFlagOverridesFromPlatform(await sign()),
    ).resolves.toBeUndefined();
  });

  describe('with the OIDC token of a request', () => {
    const symbol = Symbol.for('@vercel/request-context');
    const oidcToken = (claims: Record<string, unknown>) =>
      new SignJWT(claims).setProtectedHeader({ alg: 'ES256' }).sign(otherKey);
    const setRequestToken = (token: string) => {
      Reflect.set(globalThis, symbol, {
        get: () => ({ headers: { 'x-vercel-oidc-token': token } }),
      });
    };

    afterEach(() => {
      Reflect.deleteProperty(globalThis, symbol);
    });

    it('rejects a different team on a deployment', async () => {
      setRequestToken(await oidcToken({ owner_id: 'team_2' }));
      await expect(
        verifyFlagOverridesFromPlatform(await sign()),
      ).resolves.toBeUndefined();
    });

    it('accepts the team of the deployment', async () => {
      setRequestToken(await oidcToken({ owner_id: 'team_1' }));
      await expect(
        verifyFlagOverridesFromPlatform(await sign()),
      ).resolves.toEqual({ 'new-checkout': true });
    });

    it('prefers the token of the request over VERCEL_OIDC_TOKEN', async () => {
      vi.stubEnv('VERCEL_OIDC_TOKEN', await oidcToken({ owner_id: 'team_2' }));
      setRequestToken(await oidcToken({ owner_id: 'team_1' }));
      await expect(
        verifyFlagOverridesFromPlatform(await sign()),
      ).resolves.toEqual({ 'new-checkout': true });
    });

    it('reads the project without the system environment variables', async () => {
      vi.stubEnv('VERCEL', '');
      vi.stubEnv('VERCEL_PROJECT_ID', '');
      vi.stubEnv('VERCEL_TARGET_ENV', '');
      setRequestToken(
        await oidcToken({
          project_id: 'prj_1',
          environment: 'preview',
          owner_id: 'team_1',
        }),
      );
      const token = await sign();
      expect(isFlagOverridesFromPlatform(token)).toBe(true);
      await expect(verifyFlagOverridesFromPlatform(token)).resolves.toEqual({
        'new-checkout': true,
      });
    });
  });

  it('rejects tokens when the project is not known', async () => {
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    await expect(
      verifyFlagOverridesFromPlatform(await sign()),
    ).resolves.toBeUndefined();
    expect(fetchKeys).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'the project or the environment of this host is not known',
      ),
    );
  });

  it('loads the keys again for a new key, but not more often than every 30 seconds', async () => {
    vi.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
    await verifyFlagOverridesFromPlatform(await sign());
    const unknown = await sign({}, { header: { kid: 'key-2' } });

    await verifyFlagOverridesFromPlatform(unknown);
    await verifyFlagOverridesFromPlatform(unknown);
    expect(fetchKeys).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    await verifyFlagOverridesFromPlatform(unknown);
    expect(fetchKeys).toHaveBeenCalledTimes(2);
  });

  it('ignores tokens while the keys can not be loaded, and retries after 30 seconds', async () => {
    vi.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
    fetchKeys.mockResolvedValueOnce(new Response('error', { status: 500 }));
    const token = await sign();

    await expect(
      verifyFlagOverridesFromPlatform(token),
    ).resolves.toBeUndefined();
    await expect(
      verifyFlagOverridesFromPlatform(token),
    ).resolves.toBeUndefined();
    expect(fetchKeys).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /Could not load the public keys of Vercel KMS .* status 500\. A token which Vercel signed is ignored\./,
      ),
    );

    vi.advanceTimersByTime(30_000);
    await expect(verifyFlagOverridesFromPlatform(token)).resolves.toEqual({
      'new-checkout': true,
    });
  });
});

describe('isFlagOverridesFromPlatform', () => {
  it('is true for a JWS on Vercel', async () => {
    expect(isFlagOverridesFromPlatform(await sign())).toBe(true);
  });

  it('is false outside of Vercel, with one warning which names the fix', async () => {
    vi.stubEnv('VERCEL', '');
    const token = await sign();
    expect(isFlagOverridesFromPlatform(token)).toBe(false);
    expect(isFlagOverridesFromPlatform(token)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('vercel env pull'),
    );
  });

  it('is false for a JWE', async () => {
    expect(
      isFlagOverridesFromPlatform(await encryptOverrides({ a: 1 }, secret)),
    ).toBe(false);
    expect(warn).not.toHaveBeenCalled();
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

  it('ignores a cookie which the host can not read without FLAGS_SECRET', async () => {
    const encrypted = await encryptOverrides({ a: 1 }, secret);
    await expect(getOverrides(encrypted)).resolves.toBeNull();

    vi.stubEnv('VERCEL', '');
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

describe('decryptOverrides', () => {
  it('accepts signed tokens on Vercel without FLAGS_SECRET, for apps which read the cookie', async () => {
    await expect(decryptOverrides(await sign())).resolves.toEqual({
      'new-checkout': true,
    });
  });

  it('accepts signed tokens on Vercel with FLAGS_SECRET set', async () => {
    await expect(decryptOverrides(await sign(), secret)).resolves.toEqual({
      'new-checkout': true,
    });
  });

  it('decrypts FLAGS_SECRET tokens like before', async () => {
    const token = await encryptOverrides({ a: 1 }, secret);
    await expect(decryptOverrides(token, secret)).resolves.toEqual({ a: 1 });
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it('does not accept signed tokens outside of Vercel', async () => {
    vi.stubEnv('VERCEL', '');
    await expect(
      decryptOverrides(await sign(), secret),
    ).resolves.toBeUndefined();
    expect(fetchKeys).not.toHaveBeenCalled();
  });
});

describe('signOverrides', () => {
  const oidcToken = 'oidc-token';

  function stubSign(response: Response) {
    const fetchSign = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchSign);
    return fetchSign;
  }

  it('signs the overrides for the project of the host with its OIDC token', async () => {
    vi.stubEnv('VERCEL_OIDC_TOKEN', oidcToken);
    const fetchSign = stubSign(Response.json({ token: 'signed' }));

    await expect(
      signOverrides({ 'new-checkout': true }, { ttl: 120 }),
    ).resolves.toBe('signed');

    const [url, init] = fetchSign.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://api.vercel.com/v1/projects/prj_1/feature-flags/overrides/sign',
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${oidcToken}`,
    });
    expect(JSON.parse(init.body as string)).toEqual({
      overrides: { 'new-checkout': true },
      ttl: 120,
    });
  });

  it('prefers the OIDC token of the request', async () => {
    vi.stubEnv('VERCEL_OIDC_TOKEN', oidcToken);
    const symbol = Symbol.for('@vercel/request-context');
    Reflect.set(globalThis, symbol, {
      get: () => ({ headers: { 'x-vercel-oidc-token': 'request-token' } }),
    });
    const fetchSign = stubSign(Response.json({ token: 'signed' }));
    try {
      await signOverrides({});
    } finally {
      Reflect.deleteProperty(globalThis, symbol);
    }

    expect(
      (fetchSign.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
    ).toMatchObject({ authorization: 'Bearer request-token' });
  });

  it('throws without an OIDC token, and does not call Vercel', async () => {
    const fetchSign = stubSign(Response.json({ token: 'signed' }));

    await expect(signOverrides({})).rejects.toThrow(
      'flags: Could not sign the overrides, because the OIDC token',
    );
    expect(fetchSign).not.toHaveBeenCalled();
  });

  it.each([
    ['a rejected request', new Response('{}', { status: 403 }), 403],
    ['a response without a token', Response.json({}), 200],
    ['a response which is not JSON', new Response('<html>'), 200],
  ])('throws for %s', async (_name, response, status) => {
    vi.stubEnv('VERCEL_OIDC_TOKEN', oidcToken);
    stubSign(response);

    await expect(signOverrides({})).rejects.toThrow(
      `flags: Could not sign the overrides: status ${status}.`,
    );
  });
});

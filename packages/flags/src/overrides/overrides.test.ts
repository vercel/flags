import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  base64url,
  EncryptJWT,
  exportJWK,
  generateKeyPair,
  type JWK,
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
import { defineConnection } from '../connection';
import { defineFlag } from '../flag';
import { runtime } from '../runtime';
import type { Provider } from '../types';
import {
  configureOverrides,
  decryptOverrides,
  encryptOverrides,
} from './index';
import {
  SIGNED_OVERRIDES_POLICY,
  VERCEL_TOOLBAR_ISSUER,
  type VercelOverridesOptions,
} from './vercel';

const secret = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
const otherSecret = base64url.encode(
  crypto.getRandomValues(new Uint8Array(32)),
);

function createFlag(key = 'new-checkout') {
  const provider = {
    metadata: { name: 'test' },
    initialize: vi.fn(async () => {}),
    resolveBooleanEvaluation: vi.fn(async () => ({ value: false })),
  } satisfies Provider;
  const connection = defineConnection({
    provider,
    project: { platform: 'in-memory' },
  });
  return { flag: defineFlag({ key, connection }), provider };
}

function withCookie(cookie: string) {
  return new Request('https://shop.example', { headers: { cookie } });
}

let warnings: string[];

beforeEach(() => {
  runtime.reset();
  warnings = [];
  vi.spyOn(console, 'warn').mockImplementation((message) => {
    warnings.push(String(message));
  });
  vi.stubEnv('FLAGS_SECRET', secret);
  // The tests must not depend on the environment, e.g. on Vercel CI
  for (const name of [
    'VERCEL',
    'VERCEL_PROJECT_ID',
    'VERCEL_TARGET_ENV',
    'VERCEL_ENV',
    'VERCEL_OIDC_TOKEN',
  ]) {
    vi.stubEnv(name, '');
  }
});

afterEach(() => {
  runtime.setRequestSource(undefined);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('overrides with the shared secret', () => {
  it('returns the override and does not call the provider', async () => {
    const { flag, provider } = createFlag();
    const token = await encryptOverrides({ 'new-checkout': true });

    const value = await runtime.onInvoke(
      withCookie(`flag-overrides=${token}`),
      () => flag(),
    );

    expect(value).toBe(true);
    expect(provider.resolveBooleanEvaluation).not.toHaveBeenCalled();
  });

  it('does not wait for the initialization of the provider', async () => {
    const { flag, provider } = createFlag();
    const token = await encryptOverrides({ 'new-checkout': true });
    // Without onInvoke, nothing starts the initialization in advance
    const headers = new Headers({ cookie: `flag-overrides=${token}` });
    runtime.setRequestSource(() => ({ headers }));

    await expect(flag()).resolves.toBe(true);
    expect(provider.initialize).not.toHaveBeenCalled();
  });

  it('reads the cookie of v4, vercel-flag-overrides', async () => {
    const { flag } = createFlag();
    const token = await encryptOverrides({ 'new-checkout': true });

    await expect(
      runtime.onInvoke(withCookie(`vercel-flag-overrides=${token}`), () =>
        flag(),
      ),
    ).resolves.toBe(true);
  });

  it('accepts the token format of v4', async () => {
    // The same code as encryptOverrides in v4 of the SDK
    const token = await new EncryptJWT({
      o: { 'new-checkout': true },
      pur: 'overrides',
    })
      .setExpirationTime('1y')
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .encrypt(base64url.decode(secret));
    const { flag } = createFlag();

    await expect(
      runtime.onInvoke(withCookie(`vercel-flag-overrides=${token}`), () =>
        flag(),
      ),
    ).resolves.toBe(true);
  });

  it('uses only the overrides for the flags in the token', async () => {
    const { flag, provider } = createFlag('summer-sale');
    const token = await encryptOverrides({ 'new-checkout': true });

    await runtime.onInvoke(withCookie(`flag-overrides=${token}`), () => flag());
    expect(provider.resolveBooleanEvaluation).toHaveBeenCalled();
  });

  it('accepts an explicit secret', async () => {
    vi.stubEnv('FLAGS_SECRET', '');
    configureOverrides({ secret: otherSecret });
    const { flag } = createFlag();
    const token = await encryptOverrides({ 'new-checkout': true }, otherSecret);

    await expect(
      runtime.onInvoke(withCookie(`flag-overrides=${token}`), () => flag()),
    ).resolves.toBe(true);
  });

  it('accepts no tokens of the shared secret with secret false', async () => {
    configureOverrides({ secret: false });
    const { flag } = createFlag();
    const token = await encryptOverrides({ 'new-checkout': true });

    await expect(
      runtime.onInvoke(withCookie(`flag-overrides=${token}`), () => flag()),
    ).resolves.toBe(false);
    expect(warnings).toEqual([
      'flags: The override cookie was ignored. Reason: missing-secret.',
    ]);
  });

  it('throws for an explicit secret which is not valid', () => {
    expect(() => configureOverrides({ secret: 'too-short' })).toThrow(
      'flags: Invalid FLAGS_SECRET. It must be 32 random bytes, encoded as base64url.',
    );
  });

  describe('ignores the token and logs the reason', () => {
    async function rejection(
      token: string | Promise<string>,
    ): Promise<string[]> {
      const { flag } = createFlag();
      const value = await runtime.onInvoke(
        withCookie(`flag-overrides=${await token}`),
        () => flag(),
      );
      expect(value).toBe(false);
      return warnings;
    }

    it('for a different secret', async () => {
      expect(
        await rejection(
          encryptOverrides({ 'new-checkout': true }, otherSecret),
        ),
      ).toEqual([
        'flags: The override cookie was ignored. Reason: invalid-jwe.',
      ]);
    });

    it('without FLAGS_SECRET', async () => {
      const token = await encryptOverrides({ 'new-checkout': true });
      vi.stubEnv('FLAGS_SECRET', '');
      expect(await rejection(token)).toEqual([
        'flags: The override cookie was ignored. Reason: missing-secret.',
      ]);
    });

    it('for a FLAGS_SECRET which is not valid', async () => {
      const token = await encryptOverrides({ 'new-checkout': true });
      vi.stubEnv('FLAGS_SECRET', 'not-valid');
      expect(await rejection(token)).toEqual([
        'flags: The override cookie was ignored. Reason: invalid-secret.',
      ]);
    });

    it('for a different purpose', async () => {
      const token = new EncryptJWT({
        v: { 'new-checkout': true },
        pur: 'values',
      })
        .setExpirationTime('1y')
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .encrypt(base64url.decode(secret));
      expect(await rejection(token)).toEqual([
        'flags: The override cookie was ignored. Reason: invalid-jwe.',
      ]);
    });

    it('for an expired token', async () => {
      const token = encryptOverrides(
        { 'new-checkout': true },
        secret,
        Math.floor(Date.now() / 1000) - 60,
      );
      expect(await rejection(token)).toEqual([
        'flags: The override cookie was ignored. Reason: invalid-jwe.',
      ]);
    });

    it('for a token in a different format', async () => {
      expect(await rejection('not-a-token')).toEqual([
        'flags: The override cookie was ignored. Reason: malformed-token.',
      ]);
    });

    it('for a token which is too large', async () => {
      expect(await rejection('a'.repeat(20_000))).toEqual([
        'flags: The override cookie was ignored. Reason: token-too-large.',
      ]);
    });
  });

  it('ignores an override which is not a boolean', async () => {
    const { flag, provider } = createFlag();
    const token = await encryptOverrides({ 'new-checkout': 'yes' });

    await expect(
      runtime.onInvoke(withCookie(`flag-overrides=${token}`), () => flag()),
    ).resolves.toBe(false);
    expect(provider.resolveBooleanEvaluation).toHaveBeenCalled();
    expect(warnings).toEqual([
      'flags: The override of flag "new-checkout" was ignored, because it is not a boolean.',
    ]);
  });

  it('reads the token once per request', async () => {
    const { flag } = createFlag();
    const token = await encryptOverrides({}, otherSecret);

    await runtime.onInvoke(withCookie(`flag-overrides=${token}`), async () => {
      await flag();
      await flag();
    });
    expect(warnings).toHaveLength(1);
  });

  it('uses no overrides outside of a request', async () => {
    const { flag, provider } = createFlag();

    await expect(flag()).resolves.toBe(false);
    expect(provider.resolveBooleanEvaluation).toHaveBeenCalled();
  });

  it('works with the request source, e.g. in Next.js', async () => {
    const { flag } = createFlag();
    const token = await encryptOverrides({ 'new-checkout': true });
    const headers = new Headers({ cookie: `flag-overrides=${token}` });
    runtime.setRequestSource(() => ({ headers }));

    await expect(flag()).resolves.toBe(true);
  });
});

describe('decryptOverrides', () => {
  it('decrypts a token of encryptOverrides', async () => {
    const token = await encryptOverrides({ 'new-checkout': true });
    await expect(decryptOverrides(token)).resolves.toEqual({
      'new-checkout': true,
    });
  });

  it('returns undefined for a token of a different secret', async () => {
    const token = await encryptOverrides({ a: true }, otherSecret);
    await expect(decryptOverrides(token)).resolves.toBeUndefined();
  });

  it('throws without a secret', async () => {
    vi.stubEnv('FLAGS_SECRET', '');
    await expect(decryptOverrides('token')).rejects.toThrow(
      'flags: Missing FLAGS_SECRET.',
    );
  });
});

describe('overrides which Vercel signs', () => {
  const issuer = 'https://kms.vercel.com/test-issuer';
  // The issuer of the tokens which sign() creates
  let signingIssuer = issuer;
  const project = {
    teamId: 'team_1',
    projectId: 'prj_1',
    environment: 'preview',
  };
  let privateKey: CryptoKey;
  let publicJwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    publicJwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'key-1',
      alg: 'ES256',
    };
  });

  function keyServer(keys: () => JWK[] = () => [publicJwk]) {
    return vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ keys: keys() }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
  }

  function configure(options: Partial<VercelOverridesOptions> = {}) {
    const fetch = keyServer();
    configureOverrides({ vercel: { issuer, project, fetch, ...options } });
    return fetch;
  }

  function sign(
    claims: Record<string, unknown> = {},
    options: {
      key?: CryptoKey;
      kid?: string;
      issuer?: string;
      lifetime?: number;
      issuedAt?: number;
    } = {},
  ) {
    const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
    return new SignJWT({
      ver: 1,
      pur: SIGNED_OVERRIDES_POLICY.purpose,
      scope: {
        teamId: 'team_1',
        projectId: 'prj_1',
        environments: ['preview'],
      },
      overrides: { 'new-checkout': true },
      ...claims,
    })
      .setProtectedHeader({ alg: 'ES256', kid: options.kid ?? 'key-1' })
      .setIssuer(options.issuer ?? signingIssuer)
      .setAudience(SIGNED_OVERRIDES_POLICY.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + (options.lifetime ?? 120))
      .sign(options.key ?? privateKey);
  }

  async function evaluateWith(token: string) {
    const { flag, provider } = createFlag();
    const value = await runtime.onInvoke(
      withCookie(`flag-overrides=${token}`),
      () => flag(),
    );
    return { value, provider };
  }

  it('returns the override of a valid token', async () => {
    configure();
    const { value, provider } = await evaluateWith(await sign());

    expect(value).toBe(true);
    expect(provider.resolveBooleanEvaluation).not.toHaveBeenCalled();
  });

  it('loads the public keys once and keeps them', async () => {
    const fetch = configure();
    const token = await sign();

    await Promise.all([evaluateWith(token), evaluateWith(token)]);
    await evaluateWith(token);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('loads no keys for requests without a token', async () => {
    const fetch = configure();
    const { flag } = createFlag();

    await runtime.onInvoke(new Request('https://shop.example'), () => flag());
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads the keys without a timeout', async () => {
    const fetch = configure();
    await evaluateWith(await sign());

    expect(fetch.mock.calls[0]?.[1]?.signal).toBeUndefined();
  });

  describe('lifetime', () => {
    it('accepts tokens of up to 24 hours by default', async () => {
      configure();
      const { value } = await evaluateWith(
        await sign({}, { lifetime: 24 * 60 * 60 }),
      );
      expect(value).toBe(true);
    });

    it('rejects tokens of more than 24 hours by default', async () => {
      configure();
      const { value } = await evaluateWith(
        await sign({}, { lifetime: 24 * 60 * 60 + 1 }),
      );
      expect(value).toBe(false);
      expect(warnings[0]).toContain('invalid-claims');
    });

    it('accepts a longer lifetime when configured', async () => {
      const week = 7 * 24 * 60 * 60;
      configure({ maxLifetimeSeconds: week });
      const { value } = await evaluateWith(await sign({}, { lifetime: week }));
      expect(value).toBe(true);
    });
  });

  describe('ignores the token and logs the reason', () => {
    async function rejection(token: string | Promise<string>) {
      const { value } = await evaluateWith(await token);
      expect(value).toBe(false);
      return warnings[0];
    }

    it('for a different team', async () => {
      configure();
      const token = sign({
        scope: {
          teamId: 'team_2',
          projectId: 'prj_1',
          environments: ['preview'],
        },
      });
      expect(await rejection(token)).toContain('wrong-scope');
    });

    it('for a different project', async () => {
      configure();
      const token = sign({
        scope: {
          teamId: 'team_1',
          projectId: 'prj_2',
          environments: ['preview'],
        },
      });
      expect(await rejection(token)).toContain('wrong-scope');
    });

    it('for a different environment', async () => {
      configure();
      const token = sign({
        scope: {
          teamId: 'team_1',
          projectId: 'prj_1',
          environments: ['production'],
        },
      });
      expect(await rejection(token)).toContain('wrong-scope');
    });

    it('for a different issuer', async () => {
      configure();
      const token = sign({}, { issuer: 'https://kms.vercel.com/other' });
      expect(await rejection(token)).toContain('invalid-claims');
    });

    it('for a different purpose', async () => {
      configure();
      expect(await rejection(sign({ pur: 'overrides' }))).toContain(
        'invalid-claims',
      );
    });

    it('for an expired token', async () => {
      configure();
      const issuedAt = Math.floor(Date.now() / 1000) - 600;
      expect(await rejection(sign({}, { issuedAt }))).toContain(
        'expired-token',
      );
    });

    it('for a signature of a different key', async () => {
      configure();
      const other = await generateKeyPair('ES256');
      expect(await rejection(sign({}, { key: other.privateKey }))).toContain(
        'invalid-signature',
      );
    });

    it('for an algorithm which is not allowed', async () => {
      configure();
      const token = new SignJWT({})
        .setProtectedHeader({ alg: 'HS256', kid: 'key-1' })
        .sign(new Uint8Array(32));
      expect(await rejection(token)).toContain('unsupported-algorithm');
    });

    it('for a key in the token', async () => {
      configure();
      const token = new SignJWT({ ver: 1 })
        .setProtectedHeader({ alg: 'ES256', kid: 'key-1', jwk: publicJwk })
        .sign(privateKey);
      expect(await rejection(token)).toContain('malformed-token');
    });

    it('for a key which the issuer does not have', async () => {
      configure();
      expect(await rejection(sign({}, { kid: 'unknown' }))).toContain(
        'unknown-key',
      );
    });
  });

  describe('throws when the keys can not be loaded', () => {
    async function failure() {
      const { flag } = createFlag();
      return runtime
        .onInvoke(withCookie(`flag-overrides=${await sign()}`), () => flag())
        .catch((error: unknown) => error);
    }

    it('for an error of the server', async () => {
      configure({
        fetch: vi.fn(async () => new Response('', { status: 500 })),
      });
      expect(await failure()).toMatchObject({
        name: 'FlagEvaluationError',
        message:
          'flags: Could not evaluate flag "new-checkout": Could not load the public keys for the overrides from https://kms.vercel.com/test-issuer/jwks.json: status 500.',
      });
    });

    it('for a key set which contains a private key', async () => {
      const { privateKey: key } = await generateKeyPair('ES256', {
        extractable: true,
      });
      const privateJwk = { ...(await exportJWK(key)), kid: 'key-1' };
      configure({ fetch: keyServer(() => [privateJwk]) });
      expect(await failure()).toMatchObject({
        message: expect.stringContaining('the key set is not valid'),
      });
    });

    it('and loads them again on the next request', async () => {
      let fail = true;
      const working = keyServer();
      configure({
        fetch: vi.fn(async (url, init) =>
          fail ? new Response('', { status: 503 }) : working(url, init),
        ),
      });

      expect(await failure()).toBeInstanceOf(Error);
      fail = false;
      const { value } = await evaluateWith(await sign());
      expect(value).toBe(true);
    });
  });

  describe('new keys', () => {
    async function rotate() {
      const next = await generateKeyPair('ES256');
      const jwk = { ...(await exportJWK(next.publicKey)), kid: 'key-2' };
      return {
        jwk,
        token: await sign({}, { key: next.privateKey, kid: 'key-2' }),
      };
    }

    it('loads the keys again for a new key after the cooldown', async () => {
      let keys = [publicJwk];
      const fetch = keyServer(() => keys);
      configureOverrides({
        vercel: { issuer, project, fetch, cooldownMs: 1 },
      });
      await evaluateWith(await sign());

      const { jwk, token } = await rotate();
      keys = [publicJwk, jwk];
      await new Promise((resolve) => setTimeout(resolve, 5));

      expect((await evaluateWith(token)).value).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('does not load the keys more often than the cooldown', async () => {
      let keys = [publicJwk];
      const fetch = keyServer(() => keys);
      configureOverrides({ vercel: { issuer, project, fetch } });
      await evaluateWith(await sign());

      const { jwk, token } = await rotate();
      keys = [publicJwk, jwk];

      expect((await evaluateWith(token)).value).toBe(false);
      expect(warnings[0]).toContain('unknown-key');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('accepts both methods at the same time', async () => {
    configure();
    const signed = await evaluateWith(await sign());
    const shared = await evaluateWith(
      await encryptOverrides({ 'new-checkout': true }),
    );

    expect(signed.value).toBe(true);
    expect(shared.value).toBe(true);
  });

  describe('without configuration', () => {
    // Without configuration, the SDK trusts the issuer of the Vercel Toolbar
    beforeEach(() => {
      signingIssuer = VERCEL_TOOLBAR_ISSUER;
    });

    afterEach(() => {
      signingIssuer = issuer;
    });

    function onVercel() {
      vi.stubEnv('FLAGS_SECRET', '');
      vi.stubEnv('VERCEL', '1');
      vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1');
      vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
      const fetch = keyServer();
      vi.stubGlobal('fetch', fetch);
      return fetch;
    }

    it('accepts signed tokens on Vercel', async () => {
      const fetch = onVercel();
      const { value } = await evaluateWith(await sign());

      expect(value).toBe(true);
      expect(String(fetch.mock.calls[0]?.[0])).toBe(
        `${VERCEL_TOOLBAR_ISSUER}/jwks.json`,
      );
    });

    it('compares the team only when it is known', async () => {
      onVercel();
      const token = await sign({
        scope: {
          teamId: 'team_any',
          projectId: 'prj_1',
          environments: ['preview'],
        },
      });

      expect((await evaluateWith(token)).value).toBe(true);
    });

    it('uses only the shared secret when FLAGS_SECRET is set', async () => {
      onVercel();
      vi.stubEnv('FLAGS_SECRET', secret);

      expect((await evaluateWith(await sign())).value).toBe(false);
      expect(warnings).toEqual([
        'flags: The override cookie was ignored. Reason: untrusted-jws.',
      ]);
      const token = await encryptOverrides({ 'new-checkout': true });
      expect((await evaluateWith(token)).value).toBe(true);
    });

    it('accepts no signed tokens outside of Vercel', async () => {
      expect((await evaluateWith(await sign())).value).toBe(false);
      expect(warnings[0]).toContain('untrusted-jws');
    });

    it('reads the project of vercel link in development', async () => {
      onVercel();
      vi.stubEnv('VERCEL_PROJECT_ID', '');
      vi.stubEnv('VERCEL_TARGET_ENV', '');
      vi.stubEnv('NODE_ENV', 'development');
      const directory = mkdtempSync(join(tmpdir(), 'flags-'));
      mkdirSync(join(directory, '.vercel'));
      writeFileSync(
        join(directory, '.vercel/project.json'),
        JSON.stringify({ projectId: 'prj_1', orgId: 'team_1' }),
      );
      vi.spyOn(process, 'cwd').mockReturnValue(directory);

      const token = await sign({
        scope: {
          teamId: 'team_1',
          projectId: 'prj_1',
          environments: ['development'],
        },
      });
      expect((await evaluateWith(token)).value).toBe(true);

      // The team of vercel link is known, so it is compared
      const otherTeam = await sign({
        scope: {
          teamId: 'team_2',
          projectId: 'prj_1',
          environments: ['development'],
        },
      });
      expect((await evaluateWith(otherTeam)).value).toBe(false);
    });

    describe('locally with vercel env pull', () => {
      // vercel env pull writes VERCEL_OIDC_TOKEN, but not VERCEL_PROJECT_ID
      async function withOidcToken(claims: Record<string, unknown>) {
        vi.stubEnv('FLAGS_SECRET', '');
        vi.stubGlobal('fetch', keyServer());
        vi.spyOn(process, 'cwd').mockReturnValue(tmpdir());
        const oidcToken = await new SignJWT(claims)
          .setProtectedHeader({ alg: 'HS256' })
          .sign(crypto.getRandomValues(new Uint8Array(32)));
        vi.stubEnv('VERCEL_OIDC_TOKEN', oidcToken);
      }

      const local = {
        teamId: 'team_1',
        projectId: 'prj_1',
        environments: ['development'],
      };

      it('accepts tokens for the project of the OIDC token', async () => {
        await withOidcToken({
          project_id: 'prj_1',
          owner_id: 'team_1',
          environment: 'development',
        });

        expect((await evaluateWith(await sign({ scope: local }))).value).toBe(
          true,
        );
      });

      it('compares the team of the OIDC token', async () => {
        await withOidcToken({
          project_id: 'prj_1',
          owner_id: 'team_1',
          environment: 'development',
        });
        const token = await sign({ scope: { ...local, teamId: 'team_2' } });

        expect((await evaluateWith(token)).value).toBe(false);
        expect(warnings[0]).toContain('wrong-scope');
      });

      it('prefers the environment of a deployment', async () => {
        await withOidcToken({
          project_id: 'prj_other',
          environment: 'development',
        });
        vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1');
        vi.stubEnv('VERCEL_TARGET_ENV', 'preview');

        expect((await evaluateWith(await sign())).value).toBe(true);
      });

      it('ignores an OIDC token which can not be decoded', async () => {
        await withOidcToken({});
        vi.stubEnv('VERCEL_OIDC_TOKEN', 'not-a-token');
        const { flag } = createFlag();

        const error = await runtime
          .onInvoke(withCookie(`flag-overrides=${await sign()}`), () => flag())
          .catch((e: unknown) => e);
        expect(error).toMatchObject({
          message: expect.stringContaining(
            'The Vercel project for the overrides is not known.',
          ),
        });
      });
    });

    it('throws when the project is not known', async () => {
      onVercel();
      vi.stubEnv('VERCEL_PROJECT_ID', '');
      vi.spyOn(process, 'cwd').mockReturnValue(tmpdir());

      const { flag } = createFlag();
      const error = await runtime
        .onInvoke(withCookie(`flag-overrides=${await sign()}`), () => flag())
        .catch((e: unknown) => e);
      expect(error).toMatchObject({
        message: expect.stringContaining(
          'The Vercel project for the overrides is not known.',
        ),
      });
    });

    it('can be turned off with vercel false', async () => {
      onVercel();
      configureOverrides({ vercel: false });

      expect((await evaluateWith(await sign())).value).toBe(false);
      expect(warnings[0]).toContain('untrusted-jws');
    });
  });

  describe('options', () => {
    it('require HTTPS', () => {
      expect(() =>
        configureOverrides({
          vercel: { issuer: 'http://kms.example', project },
        }),
      ).toThrow('flags: The issuer of the Vercel overrides must use HTTPS.');
    });

    it('allow http://localhost for a local test issuer', () => {
      expect(() =>
        configureOverrides({
          vercel: {
            issuer: 'http://localhost:3000/issuer',
            project,
            allowInsecureLocalhost: true,
          },
        }),
      ).not.toThrow();
    });

    it('require a known project', () => {
      vi.spyOn(process, 'cwd').mockReturnValue(tmpdir());
      expect(() =>
        configureOverrides({
          vercel: { issuer, project: { projectId: 'prj_1' } },
        }),
      ).toThrow('flags: The Vercel project for the overrides is not known.');
    });

    it('use the issuer of the Vercel Toolbar by default', async () => {
      const fetch = keyServer();
      configureOverrides({ vercel: { project, fetch } });
      await evaluateWith(await sign({}, { issuer: VERCEL_TOOLBAR_ISSUER }));

      expect(String(fetch.mock.calls[0]?.[0])).toBe(
        `${VERCEL_TOOLBAR_ISSUER}/jwks.json`,
      );
    });

    it('require a positive lifetime', () => {
      expect(() =>
        configureOverrides({
          vercel: { issuer, project, maxLifetimeSeconds: 0 },
        }),
      ).toThrow(
        'flags: The option maxLifetimeSeconds of the Vercel overrides must be a positive number.',
      );
    });
  });
});

import {
  decodeProtectedHeader,
  EncryptJWT,
  exportJWK,
  generateKeyPair,
  type JWK,
  jwtDecrypt,
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
import {
  decryptFlagValues,
  encryptFlagValues,
  resetFlagValuesKeys,
  serializeFlagValues,
} from './flag-values';
import { encryptOverrides } from './overrides';

// 32 bytes as base64url
const secret = 'dGhpcy1pcy1hLXRlc3Qtc2VjcmV0LWZvci1mbGFncyE';
const jwksUrl = 'https://keys.example/jwks.json';
const values = { 'summer-sale': true, banner: 'Welcome' };

let privateKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const pair = await generateKeyPair('ECDH-ES', { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'key-1',
    use: 'enc',
    alg: 'ECDH-ES',
  };
});

function keySet(keys: unknown[], status = 200) {
  return vi.fn(async () => Response.json({ keys }, { status }));
}

beforeEach(() => {
  resetFlagValuesKeys();
  vi.stubEnv('FLAGS_SECRET', '');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_default');
  vi.stubEnv('VERCEL_TARGET_ENV', '');
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('VERCEL_OIDC_TOKEN', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('encryptFlagValues with the public key of the platform', () => {
  it('encrypts the values for the platform', async () => {
    const fetch = keySet([publicJwk]);
    const token = await encryptFlagValues(values, {
      jwksUrl,
      fetch,
      project: { projectId: 'prj_shop', environment: 'production' },
    });

    expect(decodeProtectedHeader(token)).toEqual({
      alg: 'ECDH-ES',
      enc: 'A256GCM',
      kid: 'key-1',
      projectIds: ['prj_shop'],
      epk: expect.any(Object),
    });
    const { payload } = await jwtDecrypt(token, privateKey, {
      audience: 'vercel:flag-values',
    });
    expect(payload).toEqual({
      aud: 'vercel:flag-values',
      pur: 'flag-values',
      ver: 1,
      iat: expect.any(Number),
      values,
    });
  });

  it('takes the project ID from the environment', async () => {
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_blog');
    const token = await encryptFlagValues(values, {
      jwksUrl,
      fetch: keySet([publicJwk]),
    });

    expect(decodeProtectedHeader(token)).toMatchObject({
      projectIds: ['prj_blog'],
    });
  });

  it('encrypts for explicit project IDs', async () => {
    const token = await encryptFlagValues(values, {
      jwksUrl,
      fetch: keySet([publicJwk]),
      projectIds: ['prj_shell', 'prj_microfrontend'],
    });

    expect(decodeProtectedHeader(token)).toMatchObject({
      projectIds: ['prj_shell', 'prj_microfrontend'],
    });
  });

  it('requires a project ID before loading the key', async () => {
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    const fetch = keySet([publicJwk]);

    await expect(encryptFlagValues(values, { jwksUrl, fetch })).rejects.toThrow(
      'flags: Missing a project ID',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'an empty list', projectIds: [] },
    { name: 'an empty ID', projectIds: [''] },
    { name: 'a long ID', projectIds: ['x'.repeat(151)] },
    { name: 'duplicate IDs', projectIds: ['prj_a', 'prj_a'] },
    { name: 'too many IDs', projectIds: Array(101).fill('prj_a') },
  ])('rejects $name', async ({ projectIds }) => {
    await expect(
      encryptFlagValues(values, {
        jwksUrl,
        fetch: keySet([publicJwk]),
        projectIds,
      }),
    ).rejects.toThrow('flags: projectIds must contain');
  });

  it('loads the keys one time for concurrent and later calls', async () => {
    const fetch = keySet([publicJwk]);
    await Promise.all([
      encryptFlagValues(values, { jwksUrl, fetch }),
      encryptFlagValues(values, { jwksUrl, fetch }),
    ]);
    await encryptFlagValues(values, { jwksUrl, fetch });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('loads the keys again after five minutes, for a rotation', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetch = keySet([publicJwk]);
    await encryptFlagValues(values, { jwksUrl, fetch });
    vi.setSystemTime(Date.now() + 300_001);
    await encryptFlagValues(values, { jwksUrl, fetch });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses the first key for encryption, not a signing key', async () => {
    const signing = { ...publicJwk, kid: 'sig-1', use: 'sig' };
    const token = await encryptFlagValues(values, {
      jwksUrl,
      fetch: keySet([signing, publicJwk]),
    });

    expect(decodeProtectedHeader(token).kid).toBe('key-1');
  });

  it('sets the expiry only when it is given', async () => {
    const token = await encryptFlagValues(values, {
      jwksUrl,
      fetch: keySet([publicJwk]),
      expirationTime: '1h',
    });

    const { payload } = await jwtDecrypt(token, privateKey);
    expect(payload.exp).toBeTypeOf('number');
  });

  it('rejects a key set with a private key', async () => {
    const pair = await generateKeyPair('ECDH-ES', { extractable: true });
    const leaked = { ...(await exportJWK(pair.privateKey)), kid: 'key-2' };

    await expect(
      encryptFlagValues(values, { jwksUrl, fetch: keySet([leaked]) }),
    ).rejects.toThrow('the key set is not valid');
  });

  it('rejects a key set without a key for ECDH-ES', async () => {
    await expect(
      encryptFlagValues(values, {
        jwksUrl,
        fetch: keySet([{ kty: 'RSA', kid: 'rsa', n: 'AQAB', e: 'AQAB' }]),
      }),
    ).rejects.toThrow('no key for ECDH-ES with P-256');
  });

  it('does not load the keys again during the cooldown after an error', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetch = keySet([], 503);

    await expect(encryptFlagValues(values, { jwksUrl, fetch })).rejects.toThrow(
      `Could not load the public key for the flag values from ${jwksUrl}: status 503.`,
    );
    await expect(encryptFlagValues(values, { jwksUrl, fetch })).rejects.toThrow(
      'status 503',
    );
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 30_001);
    await expect(encryptFlagValues(values, { jwksUrl, fetch })).rejects.toThrow(
      'status 503',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('requires HTTPS for the keys, except for localhost', async () => {
    await expect(
      encryptFlagValues(values, {
        jwksUrl: 'http://keys.example/jwks.json',
        fetch: keySet([publicJwk]),
      }),
    ).rejects.toThrow('must use HTTPS');
    await expect(
      encryptFlagValues(values, {
        jwksUrl: 'http://localhost:3000/jwks.json',
        fetch: keySet([publicJwk]),
      }),
    ).resolves.toBeTypeOf('string');
  });
});

describe('encryptFlagValues with FLAGS_SECRET', () => {
  it('uses the format of v4 when FLAGS_SECRET is set', async () => {
    vi.stubEnv('FLAGS_SECRET', secret);
    const fetch = keySet([publicJwk]);
    const token = await encryptFlagValues(values, { fetch });

    expect(fetch).not.toHaveBeenCalled();
    expect(decodeProtectedHeader(token)).toEqual({
      alg: 'dir',
      enc: 'A256GCM',
    });
    await expect(decryptFlagValues(token)).resolves.toEqual(values);
  });

  it('can decrypt a token of v4', async () => {
    // As encryptFlagValues of v4 creates it
    const { base64url } = await import('jose');
    const token = await new EncryptJWT({ v: values, pur: 'values' })
      .setExpirationTime('1y')
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .encrypt(base64url.decode(secret));

    await expect(decryptFlagValues(token, secret)).resolves.toEqual(values);
  });

  it('uses the platform if the method says so', async () => {
    vi.stubEnv('FLAGS_SECRET', secret);
    const token = await encryptFlagValues(values, {
      method: 'platform',
      jwksUrl,
      fetch: keySet([publicJwk]),
    });

    expect(decodeProtectedHeader(token).alg).toBe('ECDH-ES');
  });

  it('throws for the method secret without a secret', async () => {
    await expect(
      encryptFlagValues(values, { method: 'secret' }),
    ).rejects.toThrow('Missing FLAGS_SECRET');
  });
});

describe('decryptFlagValues', () => {
  it('returns undefined for a different secret, or a token of overrides', async () => {
    const token = await encryptFlagValues(values, { secret });
    const other = 'YW5vdGhlci10ZXN0LXNlY3JldC1mb3ItZmxhZ3MtMzI';

    await expect(decryptFlagValues(token, other)).resolves.toBeUndefined();
    await expect(
      decryptFlagValues(await encryptOverrides(values, secret), secret),
    ).resolves.toBeUndefined();
  });
});

describe('serializeFlagValues', () => {
  it('escapes each < so that the content can not end the element', () => {
    const content = serializeFlagValues({ text: '</script><!--' });

    expect(content).not.toContain('<');
    expect(JSON.parse(content)).toEqual({ text: '</script><!--' });
  });

  it('writes a token as a JSON string', () => {
    expect(serializeFlagValues('a.b.c.d.e')).toBe('"a.b.c.d.e"');
  });
});

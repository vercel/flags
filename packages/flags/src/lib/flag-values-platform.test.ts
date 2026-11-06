import {
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  type JWK,
  jwtDecrypt,
  type KeyLike,
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
import { decryptFlagValues, encryptFlagValues } from './crypto';
import {
  resetFlagValuesKeys,
  VERCEL_FLAG_VALUES_JWKS_URL,
} from './flag-values-platform';

const secret = 'a'.repeat(43);
const values = { 'summer-sale': true, banner: 'Welcome' };

let privateKey: KeyLike;
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

function stubKeySet(keys: unknown[], status = 200) {
  const fetch = vi.fn(async () => Response.json({ keys }, { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => {
  resetFlagValuesKeys();
  vi.stubEnv('FLAGS_SECRET', '');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_default');
  vi.stubEnv('VERCEL_OIDC_TOKEN', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('encryptFlagValues without FLAGS_SECRET', () => {
  it('encrypts with the public key of Vercel for the project', async () => {
    const fetch = stubKeySet([publicJwk]);
    const token = await encryptFlagValues(values);

    expect(fetch).toHaveBeenCalledWith(
      VERCEL_FLAG_VALUES_JWKS_URL,
      expect.anything(),
    );
    expect(decodeProtectedHeader(token)).toEqual({
      alg: 'ECDH-ES',
      enc: 'A256GCM',
      kid: 'key-1',
      projectIds: ['prj_default'],
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

  it('takes the project ID from the OIDC token of vercel env pull', async () => {
    stubKeySet([publicJwk]);
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    const claims = Buffer.from(JSON.stringify({ project_id: 'prj_oidc' }));
    vi.stubEnv('VERCEL_OIDC_TOKEN', `e30.${claims.toString('base64url')}.x`);
    const token = await encryptFlagValues(values);

    expect(decodeProtectedHeader(token)).toMatchObject({
      projectIds: ['prj_oidc'],
    });
  });

  it('requires a project ID before loading the key', async () => {
    const fetch = stubKeySet([publicJwk]);
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    vi.spyOn(process, 'cwd').mockReturnValue('/nonexistent');

    await expect(encryptFlagValues(values)).rejects.toThrow(
      'flags: Missing FLAGS_SECRET or a project ID',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a long project ID', async () => {
    stubKeySet([publicJwk]);
    vi.stubEnv('VERCEL_PROJECT_ID', 'x'.repeat(151));

    await expect(encryptFlagValues(values)).rejects.toThrow(
      'at most 150 characters',
    );
  });

  it('loads the keys one time for concurrent and later calls', async () => {
    const fetch = stubKeySet([publicJwk]);
    await Promise.all([encryptFlagValues(values), encryptFlagValues(values)]);
    await encryptFlagValues(values);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('loads the keys again after five minutes, for a rotation', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetch = stubKeySet([publicJwk]);
    await encryptFlagValues(values);
    vi.setSystemTime(Date.now() + 300_001);
    await encryptFlagValues(values);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses the first key for encryption, not a signing key', async () => {
    stubKeySet([{ ...publicJwk, kid: 'sig-1', use: 'sig' }, publicJwk]);
    const token = await encryptFlagValues(values);

    expect(decodeProtectedHeader(token).kid).toBe('key-1');
  });

  it('sets the expiry only when it is given', async () => {
    stubKeySet([publicJwk]);
    const withExpiry = await encryptFlagValues(values, undefined, '1h');
    const withoutExpiry = await encryptFlagValues(values);

    expect((await jwtDecrypt(withExpiry, privateKey)).payload.exp).toBeTypeOf(
      'number',
    );
    expect(
      (await jwtDecrypt(withoutExpiry, privateKey)).payload.exp,
    ).toBeUndefined();
  });

  it('rejects a key set with a private key', async () => {
    const pair = await generateKeyPair('ECDH-ES', { extractable: true });
    stubKeySet([{ ...(await exportJWK(pair.privateKey)), kid: 'key-2' }]);

    await expect(encryptFlagValues(values)).rejects.toThrow(
      'the key set is not valid',
    );
  });

  it('rejects a key set without a key for ECDH-ES', async () => {
    stubKeySet([{ kty: 'RSA', kid: 'rsa', n: 'AQAB', e: 'AQAB' }]);

    await expect(encryptFlagValues(values)).rejects.toThrow(
      'no key for ECDH-ES with P-256',
    );
  });

  it('does not load the keys again during the cooldown after an error', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetch = stubKeySet([], 503);

    await expect(encryptFlagValues(values)).rejects.toThrow(
      `Could not load the public key for the flag values from ${VERCEL_FLAG_VALUES_JWKS_URL}: status 503.`,
    );
    await expect(encryptFlagValues(values)).rejects.toThrow('status 503');
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 30_001);
    await expect(encryptFlagValues(values)).rejects.toThrow('status 503');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('encryptFlagValues with FLAGS_SECRET', () => {
  it('uses FLAGS_SECRET from the environment', async () => {
    const fetch = stubKeySet([publicJwk]);
    vi.stubEnv('FLAGS_SECRET', secret);
    const token = await encryptFlagValues(values);

    expect(fetch).not.toHaveBeenCalled();
    expect(decodeProtectedHeader(token)).toEqual({
      alg: 'dir',
      enc: 'A256GCM',
    });
    await expect(decryptFlagValues(token)).resolves.toEqual(values);
  });
});

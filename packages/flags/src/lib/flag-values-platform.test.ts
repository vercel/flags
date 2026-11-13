import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
import { resetWarnings } from './vercel-platform';

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
  resetWarnings();
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

  it('prefers the OIDC token of the request over VERCEL_OIDC_TOKEN', async () => {
    stubKeySet([publicJwk]);
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    const oidcToken = (projectId: string) =>
      `e30.${Buffer.from(JSON.stringify({ project_id: projectId })).toString('base64url')}.x`;
    vi.stubEnv('VERCEL_OIDC_TOKEN', oidcToken('prj_env'));
    const symbol = Symbol.for('@vercel/request-context');
    Reflect.set(globalThis, symbol, {
      get: () => ({
        headers: { 'x-vercel-oidc-token': oidcToken('prj_request') },
      }),
    });
    try {
      const token = await encryptFlagValues(values);

      expect(decodeProtectedHeader(token)).toMatchObject({
        projectIds: ['prj_request'],
      });
    } finally {
      Reflect.deleteProperty(globalThis, symbol);
    }
  });

  it('takes the project ID from the .vercel/project.json of vercel link', async () => {
    stubKeySet([publicJwk]);
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'flags-'));
    fs.mkdirSync(path.join(cwd, '.vercel'));
    fs.writeFileSync(
      path.join(cwd, '.vercel/project.json'),
      JSON.stringify({ projectId: 'prj_linked', orgId: 'team_1' }),
    );
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    const readFileSync = vi.spyOn(fs, 'readFileSync');

    try {
      const tokens = [
        await encryptFlagValues(values),
        await encryptFlagValues(values),
        await encryptFlagValues(values),
      ];

      for (const token of tokens) {
        expect(decodeProtectedHeader(token)).toMatchObject({
          projectIds: ['prj_linked'],
        });
      }
      // The file is read one time, not for each call
      expect(readFileSync).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(cwd, { recursive: true });
    }
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

  it('loads the keys again after five minutes, for a rotation, without blocking', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    stubKeySet([publicJwk]);
    await encryptFlagValues(values);

    // The key host does not respond until `respond` is called
    let respond = (_: Response) => {};
    const fetch = vi.fn(
      () => new Promise<Response>((resolve) => (respond = resolve)),
    );
    vi.stubGlobal('fetch', fetch);
    vi.setSystemTime(Date.now() + 300_001);

    // The key which it has, while the new one loads
    const kid = async () =>
      decodeProtectedHeader(await encryptFlagValues(values)).kid;
    await expect(kid()).resolves.toBe('key-1');
    await expect(kid()).resolves.toBe('key-1');
    expect(fetch).toHaveBeenCalledTimes(1);

    respond(Response.json({ keys: [{ ...publicJwk, kid: 'key-2' }] }));
    await vi.waitFor(async () => expect(await kid()).toBe('key-2'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('waits for the new keys after ten minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    stubKeySet([publicJwk]);
    await encryptFlagValues(values);

    const fetch = stubKeySet([{ ...publicJwk, kid: 'key-2' }]);
    vi.setSystemTime(Date.now() + 600_000);

    expect(decodeProtectedHeader(await encryptFlagValues(values)).kid).toBe(
      'key-2',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the keys after ten minutes when the reload fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    stubKeySet([publicJwk]);
    await encryptFlagValues(values);

    const fetch = stubKeySet([], 503);
    vi.setSystemTime(Date.now() + 600_000);

    expect(decodeProtectedHeader(await encryptFlagValues(values)).kid).toBe(
      'key-1',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
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

  it('loads the keys with a timeout', async () => {
    const fetch = stubKeySet([publicJwk]);
    await encryptFlagValues(values);

    expect(fetch).toHaveBeenCalledWith(
      VERCEL_FLAG_VALUES_JWKS_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('loads the keys with the fetch which Next.js replaced, so a static page stays static', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const original = vi.fn(async () => Response.json({ keys: [publicJwk] }));
    // The fetch of Next.js makes a static page dynamic for no-store
    const patched = Object.assign(vi.fn(), { _nextOriginalFetch: original });
    vi.stubGlobal('fetch', patched);

    await Promise.all([encryptFlagValues(values), encryptFlagValues(values)]);
    expect(original).toHaveBeenCalledTimes(1);
    expect(original).toHaveBeenCalledWith(
      VERCEL_FLAG_VALUES_JWKS_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    // The cache still loads the keys again, for a rotation
    vi.setSystemTime(Date.now() + 300_001);
    await encryptFlagValues(values);
    expect(original).toHaveBeenCalledTimes(2);
    expect(patched).not.toHaveBeenCalled();
  });

  it('does not wrap an error with which a framework controls the render', async () => {
    // Next.js throws such an error for a fetch with no-store in a static page
    const controlFlow = Object.assign(new Error('Dynamic server usage'), {
      digest: 'DYNAMIC_SERVER_USAGE',
    });
    const fetch = vi.fn(async () => {
      throw controlFlow;
    });
    vi.stubGlobal('fetch', fetch);

    await expect(encryptFlagValues(values)).rejects.toBe(controlFlow);
    // It is not a failure of the key host, so there is no cooldown
    await expect(encryptFlagValues(values)).rejects.toBe(controlFlow);
    expect(fetch).toHaveBeenCalledTimes(2);
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

describe('decryptFlagValues', () => {
  it('warns for flag values which only Vercel can decrypt', async () => {
    stubKeySet([publicJwk]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = await encryptFlagValues(values);

    await expect(decryptFlagValues(token, secret)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('Only Vercel can decrypt them.'),
    );
  });

  it('does not warn for flag values of another secret', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = await encryptFlagValues(values, 'b'.repeat(43));

    await expect(decryptFlagValues(token, secret)).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws without FLAGS_SECRET', async () => {
    stubKeySet([publicJwk]);
    const token = await encryptFlagValues(values);

    await expect(decryptFlagValues(token)).rejects.toThrow(
      'flags: Missing FLAGS_SECRET',
    );
  });
});

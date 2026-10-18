import { describe, expect, it } from 'vitest';
import { flagValuesJwksResponse, readPublicKey } from './flag-values-jwks';

const publicKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'x-coordinate',
  y: 'y-coordinate',
  kid: 'key-1',
};

describe('readPublicKey', () => {
  it('returns the public members, for encryption with ECDH-ES', () => {
    expect(readPublicKey(JSON.stringify(publicKey))).toEqual({
      ...publicKey,
      use: 'enc',
      alg: 'ECDH-ES',
    });
  });

  it('never returns the private member, also if the variable has it', () => {
    const key = readPublicKey(JSON.stringify({ ...publicKey, d: 'secret' }));

    expect(key).not.toHaveProperty('d');
  });

  it('returns undefined for a missing or wrong key', () => {
    expect(readPublicKey(undefined)).toBeUndefined();
    expect(readPublicKey('not json')).toBeUndefined();
    expect(
      readPublicKey(JSON.stringify({ ...publicKey, crv: 'P-384' })),
    ).toBeUndefined();
    expect(
      readPublicKey(JSON.stringify({ ...publicKey, kid: undefined })),
    ).toBeUndefined();
  });
});

describe('flagValuesJwksResponse', () => {
  it('publishes the key set', async () => {
    const response = flagValuesJwksResponse(JSON.stringify(publicKey));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    expect(await response.json()).toEqual({
      keys: [{ ...publicKey, use: 'enc', alg: 'ECDH-ES' }],
    });
  });

  it('returns 503 without a key', () => {
    expect(flagValuesJwksResponse(undefined).status).toBe(503);
  });
});

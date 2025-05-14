import {
  encryptOverrides,
  decryptOverrides,
  encryptFlagValues,
  decryptFlagValues,
  encryptFlagDefinitions,
  decryptFlagDefinitions,
  createAccessProof,
  verifyAccessProof,
} from './crypto';
import { describe, it, expect } from 'vitest';

const expirationTime = '1h';
const secret = 'a'.repeat(43);
const otherSecret = 'b'.repeat(43);

describe('overrides', () => {
  it('should encrypt and decrypt overrides', async () => {
    const overrides = { 'feature-flag': true };

    const encrypted = await encryptOverrides(overrides, secret, expirationTime);

    await expect(decryptOverrides(encrypted, secret)).resolves.toEqual(
      overrides,
    );
    await expect(
      decryptOverrides(encrypted, otherSecret),
    ).resolves.toBeUndefined();
  });
});

describe('flag values', () => {
  it('should encrypt and decrypt flag values', async () => {
    const flagValues = { 'feature-flag': true };

    const encrypted = await encryptFlagValues(
      flagValues,
      secret,
      expirationTime,
    );

    await expect(decryptFlagValues(encrypted, secret)).resolves.toEqual(
      flagValues,
    );
    await expect(
      decryptFlagValues(encrypted, otherSecret),
    ).resolves.toBeUndefined();
  });
});

describe('flag definitions', () => {
  it('should encrypt and decrypt flag definitions', async () => {
    const flagDefinitions = { 'feature-flag': { options: [] } };
    const encrypted = await encryptFlagDefinitions(flagDefinitions, secret);

    await expect(decryptFlagDefinitions(encrypted, secret)).resolves.toEqual(
      flagDefinitions,
    );
    await expect(
      decryptFlagDefinitions(encrypted, otherSecret),
    ).resolves.toBeUndefined();
  });
});

describe('access proof', () => {
  it('should create and verify access proof', async () => {
    const accessProof = await createAccessProof(secret, expirationTime);
    const encryptedFlagDefinitions = await encryptFlagDefinitions({}, secret);

    await expect(verifyAccessProof(accessProof, secret)).resolves.toBe(true);
    await expect(verifyAccessProof(accessProof, otherSecret)).resolves.toBe(
      false,
    );
    await expect(
      verifyAccessProof(encryptedFlagDefinitions, secret),
    ).resolves.toBe(false);
  });
});

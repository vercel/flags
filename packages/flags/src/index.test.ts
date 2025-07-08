import { expect, it, describe } from 'vitest';
import {
  encryptOverrides,
  decryptOverrides,
  createAccessProof,
  verifyAccessProof,
  encryptFlagValues,
  decryptFlagValues,
  encryptFlagDefinitions,
  decryptFlagDefinitions,
  verifyAccess,
  version,
} from '.';

describe('exports', () => {
  it('exports crypto functions', () => {
    // these are tested in crypto.test.ts, but we ensure they are exported here
    expect(createAccessProof).toBeTypeOf('function');
    expect(verifyAccessProof).toBeTypeOf('function');
    expect(encryptOverrides).toBeTypeOf('function');
    expect(decryptOverrides).toBeTypeOf('function');
    expect(encryptFlagValues).toBeTypeOf('function');
    expect(decryptFlagValues).toBeTypeOf('function');
    expect(encryptFlagDefinitions).toBeTypeOf('function');
    expect(decryptFlagDefinitions).toBeTypeOf('function');
  });

  it('exports version', () => {
    expect(version).toBeTypeOf('string');
    expect(version).toMatch(/^\d+\.\d+\.\d+(-\w+-\d+)?$/);
  });
});

describe('verifyAccess', () => {
  it('should return true when the proof is valid', async () => {
    const secret = 'a'.repeat(43);
    const encrypted = await createAccessProof(secret, '1h');
    expect(encrypted).toBeTypeOf('string');

    // with Bearer prefix
    await expect(verifyAccess(`Bearer ${encrypted}`, secret)).resolves.toEqual(
      true,
    );

    // without Bearer prefix
    await expect(verifyAccess(encrypted, secret)).resolves.toEqual(true);
  });

  it('should return false when the proof is invalid', async () => {
    const secret = 'a'.repeat(43);
    const otherSecret = 'b'.repeat(43);
    const encrypted = await createAccessProof(secret, '1h');
    expect(encrypted).toBeTypeOf('string');

    await expect(
      verifyAccess(`Bearer ${encrypted}`, otherSecret),
    ).resolves.toEqual(false);
  });

  it('should return false when the proof is random text', async () => {
    const secret = 'a'.repeat(43);
    const encrypted = await createAccessProof(secret, '1h');
    expect(encrypted).toBeTypeOf('string');

    await expect(verifyAccess(`Bearer b`, secret)).resolves.toEqual(false);
  });
});

import { expect, it, describe } from 'vitest';
import { encrypt, decrypt, verifyAccess } from '.';

describe('encrypt and decrypt', () => {
  it('encrypt and decrypt', async () => {
    const secret = 'a'.repeat(43);
    const content = {
      c: 1,
      myFlagA: 'stringy',
      myFlagB: { nested: true },
      myBoolFlag: false,
    };

    const encrypted = await encrypt(content, secret);
    expect(encrypted).toBeTypeOf('string');

    const decrypted = await decrypt(encrypted, secret);
    expect(decrypted).toEqual(content);
  });
});

describe('verifyAccess', () => {
  it('should return true when the proof is valid', async () => {
    const secret = 'a'.repeat(43);
    const encrypted = await encrypt({}, secret);
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
    const encrypted = await encrypt({}, secret);
    expect(encrypted).toBeTypeOf('string');

    await expect(
      verifyAccess(`Bearer ${encrypted}`, otherSecret),
    ).resolves.toEqual(false);
  });

  it('should return false when the proof is random text', async () => {
    const secret = 'a'.repeat(43);
    const encrypted = await encrypt({}, secret);
    expect(encrypted).toBeTypeOf('string');

    await expect(verifyAccess(`Bearer b`, secret)).resolves.toEqual(false);
  });
});

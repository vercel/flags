import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAccessProof,
  decryptFlagValues,
  encryptFlagValues,
  encryptOverrides,
  verifyAccess,
} from '../index';
import { type FrameworkBinding, setFramework } from './framework';

const secret = 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc';

/** A framework which has FLAGS_SECRET, but process.env has not, e.g. SvelteKit during vite dev */
const binding: FrameworkBinding = {
  name: 'test',
  getHeaders: async () => {
    throw new Error('not used');
  },
  getRequest: async () => {
    throw new Error('not used');
  },
  isFrameworkSignal: () => false,
  loadEnv: async () => ({ FLAGS_SECRET: secret }),
};

beforeEach(() => {
  vi.stubEnv('FLAGS_SECRET', '');
  setFramework(binding);
});

afterEach(() => {
  setFramework(undefined);
  vi.unstubAllEnvs();
});

describe('the secret from the environment of the framework', () => {
  it('encrypts and decrypts flag values without a secret argument', async () => {
    const encrypted = await encryptFlagValues({ summerSale: true });

    await expect(decryptFlagValues(encrypted)).resolves.toEqual({
      summerSale: true,
    });
    // The same secret as the environment of the framework
    await expect(decryptFlagValues(encrypted, secret)).resolves.toEqual({
      summerSale: true,
    });
  });

  it('encrypts overrides without a secret argument', async () => {
    await expect(encryptOverrides({ summerSale: true })).resolves.toEqual(
      expect.any(String),
    );
  });

  it('verifies an access proof without a secret argument', async () => {
    const proof = await createAccessProof();

    await expect(verifyAccess(`Bearer ${proof}`)).resolves.toBe(true);
  });

  it('still prefers a secret argument', async () => {
    const other = 'oJ2lj1J5UMmvBuiNYzBg4gFkB6ouIWXJSaAI3MC5QhE';
    const encrypted = await encryptFlagValues({ summerSale: true }, other);

    await expect(decryptFlagValues(encrypted, other)).resolves.toEqual({
      summerSale: true,
    });
  });
});

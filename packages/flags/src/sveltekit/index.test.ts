import { expect, it, describe } from 'vitest';
import { getProviderData, flag } from '.';

describe('getProviderData', () => {
  it('is a function', () => {
    expect(typeof getProviderData).toBe('function');
  });
});

describe('flag', () => {
  it('defines a key', async () => {
    const f = flag({ key: 'first-flag', decide: () => false });
    expect(f).toHaveProperty('key', 'first-flag');
  });
});

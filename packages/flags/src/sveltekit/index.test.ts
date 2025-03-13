import { expect, it, describe, vi } from 'vitest';
import { getProviderData, flag } from '.';

vi.mock('$env/dynamic/private', () => ({ FLAGS_SECRET: 'secret' }));

describe('getProviderData', () => {
  it('is a function', () => {
    expect(typeof getProviderData).toBe('function');
  });
});

describe('flag', () => {
  it('defines a key', async () => {
    const f = flag<boolean>({ key: 'first-flag', decide: () => false });
    expect(f).toHaveProperty('key', 'first-flag');
  });
});

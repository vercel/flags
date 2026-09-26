import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBun } from './runtime';

describe('isBun', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when the Bun global is absent', () => {
    expect(isBun()).toBe(false);
  });

  it('returns true when the Bun global is present', () => {
    vi.stubGlobal('Bun', { version: '1.3.14' });
    expect(isBun()).toBe(true);
  });
});

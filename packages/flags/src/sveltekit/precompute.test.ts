import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import * as s from '../lib/serialization';
import { flag } from './index';
import { generatePermutations, getPrecomputed, precompute } from './precompute';

const secret = crypto.randomBytes(32).toString('base64url');

describe('generatePermutations', () => {
  describe('when flags array is empty', () => {
    it('should return a single __no_flags__ permutation', async () => {
      const result = await generatePermutations([], null, secret);
      expect(result).toEqual(['__no_flags__']);
    });
  });
});

describe('precompute', () => {
  it('should return __no_flags__ for an empty flags array', async () => {
    const request = new Request('https://example.com');
    const result = await precompute([] as const, request, secret);
    expect(result).toBe('__no_flags__');
  });
});

describe('getPrecomputed', () => {
  it('should warn when called with __no_flags__ code', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await getPrecomputed('myFlag', [], '__no_flags__', secret);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('empty flags array'),
    );
    expect(result).toBeUndefined();

    warnSpy.mockRestore();
  });

  it('should reject when an empty-group code is used with a non-empty group', async () => {
    const flagA = flag<boolean>({ key: 'a', decide: () => true });
    await expect(
      getPrecomputed('a', [flagA], '__no_flags__', secret),
    ).rejects.toThrow(
      'Received a code for an empty flags array, but the flags array is not empty',
    );
  });

  it('should reject when a non-empty-group code is used with an empty group', async () => {
    const flagA = flag<boolean>({ key: 'a', decide: () => true });
    const code = await s.serialize({ a: true }, [flagA], secret);
    await expect(getPrecomputed('a', [], code, secret)).rejects.toThrow(
      'Received a code for a non-empty flags array, but the flags array is empty',
    );
  });

  it('should warn when flag is not part of precomputed flags', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const flagA = flag<boolean>({ key: 'a', decide: () => true });
    const group = [flagA];
    const code = await s.serialize({ a: true }, group, secret);
    const result = await getPrecomputed('b', group, code, secret);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not part of the precomputed flags'),
    );
    expect(result).toBeUndefined();

    warnSpy.mockRestore();
  });
});

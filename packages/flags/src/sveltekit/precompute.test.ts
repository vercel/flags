import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generatePermutations, precompute } from './precompute';

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

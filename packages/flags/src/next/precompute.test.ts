import { describe, expect, it } from 'vitest';
import { deserialize, type Flag, flag, generatePermutations } from './index';
import crypto from 'node:crypto';
import type { JsonValue } from '../types';

/**
 * Helper function to assert the generated permutations.
 *
 * @param group the group of flags to generate permutations for
 * @param expected the expected permutations
 */
async function expectPermutations(
  group: Flag<any, any>[],
  expected: any[],
  filter?: ((permutation: Record<string, JsonValue>) => boolean) | null,
) {
  const permutationsPromise = generatePermutations(group, filter);
  await expect(permutationsPromise).resolves.toHaveLength(expected.length);

  const permutations = await permutationsPromise;
  await expect(
    Promise.all(permutations.map((p) => deserialize(group, p))),
  ).resolves.toEqual(expected);
}

describe('generatePermutations', () => {
  describe('when flag declares no options', () => {
    it('should infer boolean options', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = flag({ key: 'a', decide: () => false });
      await expectPermutations([flagA], [{ a: false }, { a: true }]);
    });
  });

  describe('when flag declares empty options', () => {
    it('should not infer any options', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = flag({ key: 'a', decide: () => false, options: [] });
      await expectPermutations([flagA], []);
    });
  });

  describe('when flag declares options', () => {
    it('should generate permutations', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = flag<string>({
        key: 'a',
        decide: () => 'two',
        options: ['one', 'two', 'three'],
      });

      await expectPermutations(
        [flagA],
        [{ a: 'one' }, { a: 'two' }, { a: 'three' }],
      );
    });
  });

  describe('when flag declares options with a filter', () => {
    it('should generate permutations', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = flag<string>({
        key: 'a',
        decide: () => 'two',
        options: ['one', 'two', 'three'],
      });

      await expectPermutations(
        [flagA],
        [{ a: 'two' }],
        // the filter passed to generatePermutations()
        (permutation) => permutation.a === 'two',
      );
    });
  });

  describe('multiple flags with inferred options', () => {
    it('should generate permutations', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = flag({
        key: 'a',
        decide: () => false,
      });

      const flagB = flag({
        key: 'b',
        decide: () => false,
      });

      await expectPermutations(
        [flagA, flagB],
        [
          { a: false, b: false },
          { a: true, b: false },
          { a: false, b: true },
          { a: true, b: true },
        ],
      );
    });
  });

  describe('multiple flags with a mix of inferred and declared options', () => {
    it('should generate permutations', async () => {
      process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

      const flagA = flag({
        key: 'a',
        decide: () => false,
      });

      const flagB = flag({
        key: 'b',
        decide: () => false,
      });

      const flagC = flag({
        key: 'c',
        decide: () => 'two',
        options: ['one', 'two', 'three'],
      });

      await expectPermutations(
        [flagA, flagB, flagC],
        [
          { a: false, b: false, c: 'one' },
          { a: true, b: false, c: 'one' },
          { a: false, b: true, c: 'one' },
          { a: true, b: true, c: 'one' },

          { a: false, b: false, c: 'two' },
          { a: true, b: false, c: 'two' },
          { a: false, b: true, c: 'two' },
          { a: true, b: true, c: 'two' },

          { a: false, b: false, c: 'three' },
          { a: true, b: false, c: 'three' },
          { a: false, b: true, c: 'three' },
          { a: true, b: true, c: 'three' },
        ],
      );
    });

    describe('multiple flags with a mix of inferred and declared options, filtered', () => {
      it('should generate permutations', async () => {
        process.env.FLAGS_SECRET = crypto.randomBytes(32).toString('base64url');

        const flagA = flag({
          key: 'a',
          decide: () => false,
        });

        const flagB = flag({
          key: 'b',
          decide: () => false,
        });

        const flagC = flag({
          key: 'c',
          decide: () => 'two',
          options: ['one', 'two', 'three'],
        });

        await expectPermutations(
          [flagA, flagB, flagC],
          [
            { a: false, b: true, c: 'two' },
            { a: true, b: true, c: 'two' },
          ],
          (permutation) => permutation.c === 'two' && permutation.b,
        );
      });
    });
  });
});

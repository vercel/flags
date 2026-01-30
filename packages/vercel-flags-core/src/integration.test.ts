import { beforeAll, describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import { createClient, type FlagsClient } from './index.default';
import {
  Comparator,
  type EvaluationResult,
  OutcomeType,
  type Packed,
  ResolutionReason,
} from './types';

describe('integration evaluate', () => {
  let client: FlagsClient;

  beforeAll(async () => {
    // It's okay that this is commited as it's public
    const connectionString = 'vf_server_aOTtiYdgpJIkd27yDW4uDbLHmpmIVmwG';
    if (!connectionString) {
      throw new Error(
        'integration-tests: Missing env var INTEGRATION_TEST_CONNECTION_STRING',
      );
    }

    client = createClient(connectionString);
  });

  it('should evaluate active flags', async () => {
    const result = await client.evaluate('active');
    expect(result.value).toBe(true);
    expect(result.reason).toBe(ResolutionReason.FALLTHROUGH);
    expect(result.outcomeType).toBe(OutcomeType.VALUE);
    expect(result.metrics).toBeDefined();
    expect(result.metrics.source).toBeDefined();
  });

  it('should evaluate paused flags', async () => {
    const result = await client.evaluate('paused');
    expect(result.value).toBe(true);
    expect(result.reason).toBe(ResolutionReason.PAUSED);
    expect(result.outcomeType).toBe(OutcomeType.VALUE);
    expect(result.metrics).toBeDefined();
  });

  describe('when there is an error', () => {
    it('should fall back to the defaultValue', async () => {
      const result = await client.evaluate('does-not-exist', true);
      expect(result.value).toBe(true);
      expect(result.reason).toBe(ResolutionReason.ERROR);
      expect(result.errorCode).toBe('FLAG_NOT_FOUND');
      expect(result.errorMessage).toBe(
        'Definition not found for flag "does-not-exist"',
      );
      expect(result.metrics).toBeDefined();
    });
  });

  it('should evaluate with an entity', async () => {
    const result = await client.evaluate('username', false, {
      user: { name: 'Joe' },
    });
    expect(result.value).toBe(true);
    expect(result.reason).toBe(ResolutionReason.RULE_MATCH);
    expect(result.outcomeType).toBe(OutcomeType.VALUE);
  });

  it('should not fail on partial entities', async () => {
    const result1 = await client.evaluate('username', false, { user: {} });
    expect(result1.value).toBe(false);
    expect(result1.reason).toBe(ResolutionReason.FALLTHROUGH);
    expect(result1.outcomeType).toBe(OutcomeType.VALUE);

    const result2 = await client.evaluate('username', false, {});
    expect(result2.value).toBe(false);
    expect(result2.reason).toBe(ResolutionReason.FALLTHROUGH);
    expect(result2.outcomeType).toBe(OutcomeType.VALUE);
  });

  it('should respect a collapsed envConfig', async () => {
    const result = await client.evaluate('collapsed');
    expect(result.value).toBe(false);
    expect(result.reason).toBe(ResolutionReason.PAUSED);
    expect(result.outcomeType).toBe(OutcomeType.VALUE);
  });

  // Note: The 'reuse' test requires setting environment to 'preview' which
  // is no longer possible on the client directly. This behavior is tested
  // in evaluate.test.ts instead.

  describe('targets', () => {
    it('should respect targeting', async () => {
      const result = await client.evaluate('targeting', undefined, {
        user: { name: 'Joe', id: 'joesId' },
      });
      expect(result.value).toBe(true);
      expect(result.reason).toBe(ResolutionReason.TARGET_MATCH);
      expect(result.outcomeType).toBe(OutcomeType.VALUE);
    });
  });

  describe('segments', () => {
    it('should respect segment conditions', async () => {
      const result = await client.evaluate('reuse', undefined, {
        user: { name: 'Joe' },
      });
      expect(result.value).toBe(true);
      expect(result.reason).toBe(ResolutionReason.RULE_MATCH);
      expect(result.outcomeType).toBe(OutcomeType.VALUE);
    });

    it('should respect segment inclusion', async () => {
      const result = await client.evaluate('segment-targets', undefined, {
        user: { id: 'uid1' },
      });
      expect(result.value).toBe(true);
      expect(result.reason).toBe(ResolutionReason.RULE_MATCH);
      expect(result.outcomeType).toBe(OutcomeType.VALUE);
    });

    const definition: Packed.FlagDefinition = {
      environments: {
        production: {
          rules: [
            {
              conditions: [['segment', Comparator.ONE_OF, ['segment1']]],
              outcome: 1,
            },
          ],
          fallthrough: 0,
        },
      },
      variants: [false, true],
    };

    it('should respect segment exclusion', () => {
      expect(
        evaluate({
          definition,
          environment: 'production',
          entities: { user: { id: 'uid1' } },
          segments: {
            segment1: {
              rules: [
                {
                  conditions: [[['user', 'id'], Comparator.EQ, 'uid1']],
                  outcome: 1,
                },
              ],
              exclude: { user: { id: ['uid1'] } },
            },
          },
        }),
      ).toEqual({
        value: false,
        reason: ResolutionReason.FALLTHROUGH,
        outcomeType: OutcomeType.VALUE,
      });

      expect(
        evaluate({
          definition,
          environment: 'production',
          entities: { user: { name: 'Jim' } },
          segments: {
            segment1: {
              rules: [
                {
                  conditions: [[['user', 'name'], Comparator.EQ, 'Joe']],
                  outcome: 1,
                },
              ],
            },
          },
        }),
      ).toEqual({
        value: false,
        reason: ResolutionReason.FALLTHROUGH,
        outcomeType: OutcomeType.VALUE,
      });
    });

    it('should let inclusion win over exclusion  ', () => {
      expect(
        evaluate({
          definition,
          environment: 'production',
          entities: { user: { id: 'uid1' } },
          segments: {
            segment1: {
              include: { user: { id: ['uid1'] } },
              exclude: { user: { id: ['uid1'] } },
            },
          },
        }),
      ).toEqual({
        value: true,
        reason: ResolutionReason.RULE_MATCH,
        outcomeType: OutcomeType.VALUE,
      });
    });

    it('should respect segment splits', () => {
      expect(
        evaluate({
          definition,
          environment: 'production',
          entities: { user: { name: 'Joe' } },
          segments: {
            segment1: {
              rules: [
                {
                  conditions: [[['user', 'name'], Comparator.EQ, 'Joe']],
                  outcome: {
                    type: 'split',
                    base: ['user', 'name'],
                    passPromille: 100_000,
                  },
                },
              ],
            },
          },
        }),
      ).toEqual({
        value: true,
        reason: ResolutionReason.RULE_MATCH,
        outcomeType: OutcomeType.VALUE,
      });

      expect(
        evaluate({
          definition,
          environment: 'production',
          entities: { user: { name: 'Joe' } },
          segments: {
            segment1: {
              rules: [
                {
                  conditions: [[['user', 'name'], Comparator.EQ, 'Joe']],
                  outcome: {
                    type: 'split',
                    base: ['user', 'name'],
                    passPromille: 0,
                  },
                },
              ],
            },
          },
        }),
      ).toEqual({
        value: false,
        reason: ResolutionReason.FALLTHROUGH,
        outcomeType: OutcomeType.VALUE,
      });
    });

    it('should split roughly equally on a 50/50 split', () => {
      const results: EvaluationResult<boolean>[] = [];

      for (let i = 0; i < 10_000; i++) {
        results.push(
          evaluate({
            definition,
            environment: 'production',
            entities: { user: { name: `name${i}` } },
            segments: {
              segment1: {
                rules: [
                  {
                    conditions: [[['user', 'name'], Comparator.EQ, `name${i}`]],
                    outcome: {
                      type: 'split',
                      base: ['user', 'name'],
                      passPromille: 50_000,
                    },
                  },
                ],
              },
            },
          }),
        );
      }

      const trueCount = results.filter((r) => r.value).length;
      const falseCount = results.filter((r) => !r.value).length;

      // both should be close to 500
      expect(trueCount).toBe(5070);
      expect(falseCount).toBe(4930);
    });

    it('should split roughly equally on a 50/50 split', () => {
      const results: EvaluationResult<boolean>[] = [];

      for (let i = 0; i < 10_000; i++) {
        results.push(
          evaluate({
            definition,
            environment: 'production',
            entities: { user: { name: `name${i}` } },
            segments: {
              segment1: {
                rules: [
                  {
                    conditions: [[['user', 'name'], Comparator.EQ, `name${i}`]],
                    outcome: {
                      type: 'split',
                      base: ['user', 'name'],
                      passPromille: 1_000, // pass 1%
                    },
                  },
                ],
              },
            },
          }),
        );
      }

      const trueCount = results.filter((r) => r.value).length;
      const falseCount = results.filter((r) => !r.value).length;

      // both should be close to 100 (1%)
      expect(trueCount).toBe(102);
      expect(falseCount).toBe(9898);
    });

    it('should split roughly equally on a 50/50 split', () => {
      const results: EvaluationResult<boolean>[] = [];

      for (let i = 0; i < 10_000; i++) {
        results.push(
          evaluate({
            definition,
            environment: 'production',
            entities: { user: { name: `name${i}` } },
            segments: {
              segment1: {
                rules: [
                  {
                    conditions: [[['user', 'name'], Comparator.EQ, `name${i}`]],
                    outcome: {
                      type: 'split',
                      base: ['user', 'name'],
                      passPromille: 99_000, // pass 1%
                    },
                  },
                ],
              },
            },
          }),
        );
      }

      const trueCount = results.filter((r) => r.value).length;
      const falseCount = results.filter((r) => !r.value).length;

      // both should be close to 9900 (99%)
      expect(trueCount).toBe(9891);
      expect(falseCount).toBe(109);
    });
  });
});

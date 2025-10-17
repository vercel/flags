import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFlagsClientFromConnectionString, type FlagsClient } from '.';
import { evaluate } from './evaluate';
import {
  Comparator,
  type EvaluationResult,
  OutcomeType,
  type Packed,
  Reason,
} from './types';

describe('integration evaluate', () => {
  let client: FlagsClient;
  let defaultEnvironment: string;

  beforeAll(async () => {
    const connectionString = process.env.INTEGRATION_TEST_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error(
        'integration-tests: Missing env var INTEGRATION_TEST_CONNECTION_STRING',
      );
    }

    client = createFlagsClientFromConnectionString(connectionString);
    defaultEnvironment = client.environment;
  });

  beforeEach(() => {
    client.environment = defaultEnvironment;
  });

  it('should evaluate active flags', async () => {
    expect(await client.evaluate('active')).toEqual({
      value: true,
      reason: Reason.FALLTHROUGH,
      outcomeType: OutcomeType.VALUE,
    });
  });

  it('should evaluate paused flags', async () => {
    expect(await client.evaluate('paused')).toEqual({
      value: true,
      reason: Reason.PAUSED,
      outcomeType: OutcomeType.VALUE,
    });
  });

  describe('when there is an error', () => {
    it('should fall back to the defaultValue', async () => {
      expect(await client.evaluate('does-not-exist', true)).toEqual({
        value: true,
        reason: Reason.ERROR,
        errorMessage: 'Definition not found for flag "does-not-exist"',
      });
    });

    it('should error for missing environment config', async () => {
      client.environment = 'this-env-does-not-exist-and-will-cause-an-error';
      expect(await client.evaluate('active')).toEqual({
        reason: Reason.ERROR,
        errorMessage:
          'Could not find envConfig for "this-env-does-not-exist-and-will-cause-an-error"',
      });
    });
  });

  it('should evaluate with an entity', async () => {
    expect(
      await client.evaluate('username', false, { user: { name: 'Joe' } }),
    ).toEqual({
      value: true,
      reason: Reason.RULE_MATCH,
      outcomeType: OutcomeType.VALUE,
    });
  });

  it('should not fail on partial entities', async () => {
    expect(await client.evaluate('username', false, { user: {} })).toEqual({
      value: false,
      reason: Reason.FALLTHROUGH,
      outcomeType: OutcomeType.VALUE,
    });

    expect(await client.evaluate('username', false, {})).toEqual({
      value: false,
      reason: Reason.FALLTHROUGH,
      outcomeType: OutcomeType.VALUE,
    });
  });

  it('should respect a collapsed envConfig', async () => {
    expect(await client.evaluate('collapsed')).toEqual({
      value: false,
      reason: Reason.PAUSED,
      outcomeType: OutcomeType.VALUE,
    });
  });

  it('should reuse an active environment', async () => {
    client.environment = 'preview';

    expect(
      await client.evaluate('reuse', undefined, { user: { name: 'Joe' } }),
    ).toEqual({
      value: true,
      reason: Reason.RULE_MATCH,
      outcomeType: OutcomeType.VALUE,
    });
  });

  describe('targets', () => {
    it('should respect targeting', async () => {
      expect(
        await client.evaluate('targeting', undefined, {
          user: { name: 'Joe', id: 'joesId' },
        }),
      ).toEqual({
        value: true,
        reason: Reason.TARGET_MATCH,
        outcomeType: OutcomeType.VALUE,
      });
    });
  });

  describe('segments', () => {
    it('should respect segment conditions', async () => {
      expect(
        await client.evaluate('reuse', undefined, { user: { name: 'Joe' } }),
      ).toEqual({
        value: true,
        reason: Reason.RULE_MATCH,
        outcomeType: OutcomeType.VALUE,
      });
    });

    it('should respect segment inclusion', async () => {
      expect(
        await client.evaluate('segment-targets', undefined, {
          user: { id: 'uid1' },
        }),
      ).toEqual({
        value: true,
        reason: Reason.RULE_MATCH,
        outcomeType: OutcomeType.VALUE,
      });
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
        reason: Reason.FALLTHROUGH,
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
        reason: Reason.FALLTHROUGH,
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
        reason: Reason.RULE_MATCH,
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
        reason: Reason.RULE_MATCH,
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
        reason: Reason.FALLTHROUGH,
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

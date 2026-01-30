import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import {
  Comparator,
  type EvaluationResult,
  OutcomeType,
  type Packed,
  ResolutionReason,
} from './types';

describe('evaluate', () => {
  it('should evaluate active flags', () => {
    expect(
      evaluate({
        definition: {
          environments: {
            production: { fallthrough: 1 },
          },
          variants: [false, true],
        } satisfies Packed.FlagDefinition,
        environment: 'production',
        entities: {},
      }),
    ).toEqual({
      value: true,
      reason: ResolutionReason.FALLTHROUGH,
      outcomeType: OutcomeType.VALUE,
    });
  });

  it('should evaluate paused flags', () => {
    expect(
      evaluate({
        definition: {
          environments: { production: 1 },
          variants: [false, true],
        } satisfies Packed.FlagDefinition,
        environment: 'production',
        entities: {},
      }),
    ).toEqual({
      value: true,
      reason: ResolutionReason.PAUSED,
      outcomeType: OutcomeType.VALUE,
    });
  });

  describe('when there is an error', () => {
    it('should fall back to the defaultValue', () => {
      expect(
        evaluate({
          defaultValue: true,
          definition: {
            environments: { production: 0 },
            variants: [false, true],
          } satisfies Packed.FlagDefinition,
          environment: 'this-env-does-not-exist-and-will-cause-an-error',
          entities: {},
        }),
      ).toEqual({
        value: true,
        reason: ResolutionReason.ERROR,
        errorMessage:
          'Could not find envConfig for "this-env-does-not-exist-and-will-cause-an-error"',
      });
    });
  });

  it('should evaluate with an entity', () => {
    expect(
      evaluate({
        definition: {
          environments: {
            production: {
              rules: [
                {
                  conditions: [[['user', 'name'], Comparator.EQ, 'Joe']],
                  outcome: 1,
                },
              ],
              fallthrough: 0,
            },
          },
          variants: [false, true],
        } satisfies Packed.FlagDefinition,
        environment: 'production',
        entities: { user: { name: 'Joe' } },
      }),
    ).toEqual({
      value: true,
      reason: ResolutionReason.RULE_MATCH,
      outcomeType: OutcomeType.VALUE,
    });
  });

  it('should not fail on partial entities', () => {
    expect(
      evaluate({
        definition: {
          environments: {
            production: {
              rules: [
                {
                  conditions: [[['user', 'name'], Comparator.EQ, 'Joe']],
                  outcome: 1,
                },
              ],
              fallthrough: 0,
            },
          },
          variants: [false, true],
        } satisfies Packed.FlagDefinition,
        environment: 'production',
        entities: { user: {} },
      }),
    ).toEqual({
      value: false,
      reason: ResolutionReason.FALLTHROUGH,
      outcomeType: OutcomeType.VALUE,
    });

    expect(
      evaluate({
        definition: {
          environments: {
            production: {
              rules: [
                {
                  conditions: [[['user', 'name'], Comparator.EQ, 'Joe']],
                  outcome: 1,
                },
              ],
              fallthrough: 0,
            },
          },
          variants: [false, true],
        } satisfies Packed.FlagDefinition,
        environment: 'production',
        entities: {},
      }),
    ).toEqual({
      value: false,
      reason: ResolutionReason.FALLTHROUGH,
      outcomeType: OutcomeType.VALUE,
    });
  });

  it('should respect an index outcome', () => {
    expect(
      evaluate({
        definition: {
          environments: {
            production: {
              rules: [
                {
                  conditions: [[['user', 'name'], Comparator.EQ, 'Joe']],
                  outcome: 1,
                },
              ],
              fallthrough: 0,
            },
          },
          variants: [false, true],
        } satisfies Packed.FlagDefinition,
        environment: 'production',
        entities: { user: { name: 'Joe' } },
      }),
    ).toEqual({
      value: true,
      reason: ResolutionReason.RULE_MATCH,
      outcomeType: OutcomeType.VALUE,
    });
  });

  it('should respect a collapsed envConfig', () => {
    expect(
      evaluate({
        definition: {
          environments: { production: 0 },
          variants: [false, true],
        } satisfies Packed.FlagDefinition,
        environment: 'production',
      }),
    ).toEqual({
      value: false,
      reason: ResolutionReason.PAUSED,
      outcomeType: OutcomeType.VALUE,
    });
  });

  it('should respect a different environment', () => {
    expect(
      evaluate({
        definition: {
          environments: { production: 0, preview: 1 },
          variants: [false, true],
        } satisfies Packed.FlagDefinition,
        environment: 'preview',
      }),
    ).toEqual({
      value: true,
      reason: ResolutionReason.PAUSED,
      outcomeType: OutcomeType.VALUE,
    });
  });

  it('should reuse an active environment', () => {
    expect(
      evaluate({
        definition: {
          environments: {
            production: {
              rules: [
                {
                  conditions: [['segment', Comparator.EQ, 'segment1']],
                  outcome: 1,
                },
              ],
              fallthrough: 0,
            },
            preview: { reuse: 'production' },
          },
          variants: [false, true],
        } satisfies Packed.FlagDefinition,
        environment: 'preview',
        entities: { user: { name: 'Joe' } },
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
      value: true,
      reason: ResolutionReason.RULE_MATCH,
      outcomeType: OutcomeType.VALUE,
    });
  });

  it('should reuse a paused environment', () => {
    expect(
      evaluate({
        definition: {
          environments: {
            production: 0,
            preview: { reuse: 'production' },
          },
          variants: [false, true],
        } satisfies Packed.FlagDefinition,
        environment: 'preview',
        entities: { user: { name: 'Joe' } },
        segments: {},
      }),
    ).toEqual({
      value: false,
      reason: ResolutionReason.PAUSED,
      outcomeType: OutcomeType.VALUE,
    });
  });

  describe('targets', () => {
    it('should respect targeting', () => {
      expect(
        evaluate({
          definition: {
            environments: {
              production: {
                targets: [{}, { user: { name: ['Joe'] } }],
                fallthrough: 0,
              },
            },
            variants: [false, true],
          } satisfies Packed.FlagDefinition,
          environment: 'production',
          entities: { user: { name: 'Joe' } },
        }),
      ).toEqual({
        value: true,
        reason: ResolutionReason.TARGET_MATCH,
        outcomeType: OutcomeType.VALUE,
      });
    });
  });

  describe('segments', () => {
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

    it('should respect single segment', () => {
      expect(
        evaluate({
          definition: {
            environments: {
              production: {
                rules: [
                  {
                    conditions: [['segment', Comparator.EQ, 'segment1']],
                    outcome: 1,
                  },
                ],
                fallthrough: 0,
              },
            },
            variants: [false, true],
          } satisfies Packed.FlagDefinition,
          environment: 'production',
          entities: { user: { name: 'Joe' } },
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
        value: true,
        reason: ResolutionReason.RULE_MATCH,
        outcomeType: OutcomeType.VALUE,
      });
    });

    it('should not match when there are no conditions', () => {
      expect(
        evaluate({
          definition,
          environment: 'production',
          entities: { user: { id: 'uid1' } },
          segments: {
            segment1: { rules: [], include: {}, exclude: {} },
          },
        }),
      ).toEqual({
        value: false,
        reason: ResolutionReason.FALLTHROUGH,
        outcomeType: OutcomeType.VALUE,
      });
    });

    it('should respect segment conditions', () => {
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
                  outcome: 1,
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

    it('should respect segment inclusion', () => {
      expect(
        evaluate({
          definition,
          environment: 'production',
          entities: { user: { id: 'uid1' } },
          segments: {
            segment1: {
              include: { user: { id: ['uid1'] } },
            },
          },
        }),
      ).toEqual({
        value: true,
        reason: ResolutionReason.RULE_MATCH,
        outcomeType: OutcomeType.VALUE,
      });
    });

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

  it.each<{
    name: string;
    condition: Packed.Condition;
    entities: Record<string, unknown> | undefined;
    result: boolean;
  }>([
    // EQ (string)
    {
      name: `${Comparator.EQ} match (string)`,
      condition: [['user', 'id'], Comparator.EQ, 'uid1'],
      entities: { user: { id: 'uid1' } },
      result: true,
    },
    {
      name: `${Comparator.EQ} miss (string)`,
      condition: [['user', 'id'], Comparator.EQ, 'uid2'],
      entities: { user: { id: 'uid1' } },
      result: false,
    },
    {
      name: `${Comparator.EQ} unset (string)`,
      condition: [['user', 'id'], Comparator.EQ, 'uid2'],
      entities: {},
      result: false,
    },

    // EQ (number)
    {
      name: `${Comparator.EQ} match (number)`,
      condition: [['user', 'age'], Comparator.EQ, 18],
      entities: { user: { age: 18 } },
      result: true,
    },
    {
      name: `${Comparator.EQ} miss (number)`,
      condition: [['user', 'age'], Comparator.EQ, 22],
      entities: { user: { age: 18 } },
      result: false,
    },
    {
      name: `${Comparator.EQ} unset (number)`,
      condition: [['user', 'age'], Comparator.EQ, 22],
      entities: {},
      result: false,
    },

    // NOT_EQ
    {
      name: `${Comparator.NOT_EQ} match`,
      condition: [['user', 'id'], Comparator.NOT_EQ, 'uid1'],
      entities: { user: { id: 'uid2' } },
      result: true,
    },
    {
      name: `${Comparator.NOT_EQ} miss`,
      condition: [['user', 'id'], Comparator.NOT_EQ, 'uid1'],
      entities: { user: { id: 'uid1' } },
      result: false,
    },
    {
      name: `${Comparator.NOT_EQ} unset`,
      condition: [['user', 'id'], Comparator.NOT_EQ, 'uid2'],
      entities: {},
      result: true,
    },

    // ONE_OF
    {
      name: `${Comparator.ONE_OF} match`,
      condition: [['user', 'id'], Comparator.ONE_OF, ['uid1']],
      entities: { user: { id: 'uid1' } },
      result: true,
    },
    {
      name: `${Comparator.ONE_OF} miss`,
      condition: [['user', 'id'], Comparator.ONE_OF, ['uid2']],
      entities: { user: { id: 'uid1' } },
      result: false,
    },
    {
      name: `${Comparator.ONE_OF} unset`,
      condition: [['user', 'id'], Comparator.ONE_OF, ['uid2']],
      entities: {},
      result: false,
    },

    // NOT_ONE_OF
    {
      name: `${Comparator.NOT_ONE_OF} match`,
      condition: [['user', 'id'], Comparator.NOT_ONE_OF, ['uid2']],
      entities: { user: { id: 'uid1' } },
      result: true,
    },
    {
      name: `${Comparator.NOT_ONE_OF} miss`,
      condition: [['user', 'id'], Comparator.NOT_ONE_OF, ['uid1']],
      entities: { user: { id: 'uid1' } },
      result: false,
    },
    {
      name: `${Comparator.NOT_ONE_OF} unset`,
      condition: [['user', 'id'], Comparator.NOT_ONE_OF, ['uid2']],
      entities: {},
      result: false,
    },

    // CONTAINS_ALL_OF
    {
      name: `${Comparator.CONTAINS_ALL_OF} match`,
      condition: [
        ['user', 'teamIds'],
        Comparator.CONTAINS_ALL_OF,
        ['team1', 'team2'],
      ],
      entities: { user: { teamIds: ['team2', 'team1'] } },
      result: true,
    },
    {
      name: `${Comparator.CONTAINS_ALL_OF} partial match`,
      condition: [
        ['user', 'teamIds'],
        Comparator.CONTAINS_ALL_OF,
        ['team1', 'team2'],
      ],
      entities: { user: { teamIds: ['team2'] } },
      result: false,
    },
    {
      name: `${Comparator.CONTAINS_ALL_OF} miss`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_ALL_OF, ['team1']],
      entities: { user: { teamIds: ['team2'] } },
      result: false,
    },
    {
      name: `${Comparator.CONTAINS_ALL_OF} unset`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_ALL_OF, ['team1']],
      entities: {},
      result: false,
    },
    {
      // it's on the system to forbid creation of empty arrays on the rhs, but
      // we should not special case it when evaluating
      name: `${Comparator.CONTAINS_ALL_OF} empty array`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_ALL_OF, []],
      entities: { user: { teamIds: [] } },
      result: true,
    },
    {
      // it's on the system to forbid creation of empty arrays on the rhs, but
      // we should not special case it when evaluating
      name: `${Comparator.CONTAINS_ALL_OF} empty array`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_ALL_OF, []],
      entities: { user: { teamIds: ['team1'] } },
      result: true,
    },

    // CONTAINS_NONE_OF
    {
      name: `${Comparator.CONTAINS_NONE_OF} match`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_NONE_OF, ['team1']],
      entities: { user: { teamIds: ['team2'] } },
      result: true,
    },
    {
      name: `${Comparator.CONTAINS_NONE_OF} partial match`,
      condition: [
        ['user', 'teamIds'],
        Comparator.CONTAINS_NONE_OF,
        ['team1', 'team2'],
      ],
      entities: { user: { teamIds: ['team1'] } },
      result: false,
    },
    {
      name: `${Comparator.CONTAINS_NONE_OF} miss`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_NONE_OF, ['team1']],
      entities: { user: { teamIds: ['team1'] } },
      result: false,
    },
    {
      name: `${Comparator.CONTAINS_NONE_OF} unset entity`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_NONE_OF, ['team1']],
      entities: {},
      result: true,
    },
    {
      name: `${Comparator.CONTAINS_NONE_OF} unset attribute`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_NONE_OF, ['team1']],
      entities: { user: { id: 'foo' } },
      result: true,
    },
    {
      name: `${Comparator.CONTAINS_NONE_OF} empty array`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_NONE_OF, ['team1']],
      entities: { user: { teamIds: [] } },
      result: true,
    },
    {
      name: `${Comparator.CONTAINS_NONE_OF} null array`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_NONE_OF, ['team1']],
      entities: { user: { teamIds: [null] } },
      result: true,
    },
    {
      name: `${Comparator.CONTAINS_NONE_OF} null`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_NONE_OF, ['team1']],
      entities: { user: { teamIds: null } },
      result: true,
    },
    {
      // we return true as there is no lhs array, so it can't contain any of the values
      name: `${Comparator.CONTAINS_NONE_OF} string`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_NONE_OF, ['team1']],
      entities: { user: { teamIds: 'team1' } },
      result: true,
    },
    {
      // it's on the system to forbid creation of empty arrays on the rhs, but
      // we should not special case it when evaluating
      name: `${Comparator.CONTAINS_NONE_OF} empty array`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_NONE_OF, []],
      entities: { user: { teamIds: [] } },
      result: true,
    },
    {
      // it's on the system to forbid creation of empty arrays on the rhs, but
      // we should not special case it when evaluating
      name: `${Comparator.CONTAINS_NONE_OF} empty array`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_NONE_OF, []],
      entities: { user: { teamIds: ['team1'] } },
      result: true,
    },

    // CONTAINS_ANY_OF
    {
      name: `${Comparator.CONTAINS_ANY_OF} match`,
      condition: [
        ['user', 'teamIds'],
        Comparator.CONTAINS_ANY_OF,
        ['team1', 'team2'],
      ],
      entities: { user: { teamIds: ['team2'] } },
      result: true,
    },
    {
      name: `${Comparator.CONTAINS_ANY_OF} miss`,
      condition: [
        ['user', 'teamIds'],
        Comparator.CONTAINS_ANY_OF,
        ['team1', 'team2'],
      ],
      entities: { user: { teamIds: ['team3'] } },
      result: false,
    },
    {
      name: `${Comparator.CONTAINS_ANY_OF} unset`,
      condition: [
        ['user', 'teamIds'],
        Comparator.CONTAINS_ANY_OF,
        ['team1', 'team2'],
      ],
      entities: { user: {} },
      result: false,
    },
    {
      name: `${Comparator.CONTAINS_ANY_OF} invalid`,
      condition: [
        ['user', 'teamIds'],
        Comparator.CONTAINS_ANY_OF,
        ['team1', 'team2'],
      ],
      entities: { user: { teamIds: null } },
      result: false,
    },
    {
      // it's on the system to forbid creation of empty arrays on the rhs, but
      // we should not special case it when evaluating
      name: `${Comparator.CONTAINS_ANY_OF} empty array`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_ANY_OF, []],
      entities: { user: { teamIds: [] } },
      result: false,
    },
    {
      // it's on the system to forbid creation of empty arrays on the rhs, but
      // we should not special case it when evaluating
      name: `${Comparator.CONTAINS_ANY_OF} empty array`,
      condition: [['user', 'teamIds'], Comparator.CONTAINS_ANY_OF, []],
      entities: { user: { teamIds: ['team1'] } },
      result: false,
    },

    // STARTS_WITH
    {
      name: `${Comparator.STARTS_WITH} match`,
      condition: [['user', 'id'], Comparator.STARTS_WITH, 'joe'],
      entities: { user: { id: 'joewilkinson' } },
      result: true,
    },
    {
      name: `${Comparator.STARTS_WITH} miss`,
      condition: [['user', 'id'], Comparator.STARTS_WITH, 'jim'],
      entities: { user: { id: 'joewilkinson' } },
      result: false,
    },
    {
      name: `${Comparator.STARTS_WITH} unset`,
      condition: [['user', 'id'], Comparator.STARTS_WITH, 'joe'],
      entities: { user: {} },
      result: false,
    },
    {
      name: `${Comparator.STARTS_WITH} invalid`,
      condition: [['user', 'id'], Comparator.STARTS_WITH, 'joe'],
      entities: { user: { id: null } },
      result: false,
    },

    // NOT_STARTS_WITH
    {
      name: `${Comparator.NOT_STARTS_WITH} match`,
      condition: [['user', 'id'], Comparator.NOT_STARTS_WITH, 'jim'],
      entities: { user: { id: 'joewilkinson' } },
      result: true,
    },
    {
      name: `${Comparator.NOT_STARTS_WITH} miss`,
      condition: [['user', 'id'], Comparator.NOT_STARTS_WITH, 'joe'],
      entities: { user: { id: 'joewilkinson' } },
      result: false,
    },
    {
      name: `${Comparator.NOT_STARTS_WITH} unset`,
      condition: [['user', 'id'], Comparator.NOT_STARTS_WITH, 'joe'],
      entities: { user: {} },
      result: false,
    },
    {
      name: `${Comparator.NOT_STARTS_WITH} invalid`,
      condition: [['user', 'id'], Comparator.NOT_STARTS_WITH, 'joe'],
      entities: { user: { id: null } },
      result: false,
    },

    // ENDS_WITH
    {
      name: `${Comparator.ENDS_WITH} match`,
      condition: [['user', 'id'], Comparator.ENDS_WITH, 'son'],
      entities: { user: { id: 'joewilkinson' } },
      result: true,
    },
    {
      name: `${Comparator.ENDS_WITH} miss`,
      condition: [['user', 'id'], Comparator.ENDS_WITH, 'jim'],
      entities: { user: { id: 'joewilkinson' } },
      result: false,
    },
    {
      name: `${Comparator.ENDS_WITH} unset`,
      condition: [['user', 'id'], Comparator.ENDS_WITH, 'son'],
      entities: { user: {} },
      result: false,
    },
    {
      name: `${Comparator.ENDS_WITH} invalid`,
      condition: [['user', 'id'], Comparator.ENDS_WITH, 'son'],
      entities: { user: { id: null } },
      result: false,
    },

    // NOT_ENDS_WITH
    {
      name: `${Comparator.NOT_ENDS_WITH} match`,
      condition: [['user', 'id'], Comparator.NOT_ENDS_WITH, 'jim'],
      entities: { user: { id: 'joewilkinson' } },
      result: true,
    },
    {
      name: `${Comparator.NOT_ENDS_WITH} miss`,
      condition: [['user', 'id'], Comparator.NOT_ENDS_WITH, 'son'],
      entities: { user: { id: 'joewilkinson' } },
      result: false,
    },
    {
      name: `${Comparator.NOT_ENDS_WITH} unset`,
      condition: [['user', 'id'], Comparator.NOT_ENDS_WITH, 'jim'],
      entities: { user: {} },
      result: false,
    },
    {
      name: `${Comparator.NOT_ENDS_WITH} invalid`,
      condition: [['user', 'id'], Comparator.NOT_ENDS_WITH, 'jim'],
      entities: { user: { id: null } },
      result: false,
    },

    // EXISTS
    {
      name: `${Comparator.EXISTS} match`,
      condition: [['user', 'id'], Comparator.EXISTS],
      entities: { user: { id: 'uid1' } },
      result: true,
    },
    {
      name: `${Comparator.EXISTS} miss on null`,
      condition: [['user', 'id'], Comparator.EXISTS],
      entities: { user: { id: null } },
      result: false,
    },
    {
      name: `${Comparator.EXISTS} miss on undefined`,
      condition: [['user', 'id'], Comparator.EXISTS],
      entities: { user: { id: undefined } },
      result: false,
    },

    // NOT_EXISTS
    {
      name: `${Comparator.NOT_EXISTS} match on undefined`,
      condition: [['user', 'id'], Comparator.NOT_EXISTS],
      entities: { user: { id: undefined } },
      result: true,
    },
    {
      name: `${Comparator.NOT_EXISTS} match on null`,
      condition: [['user', 'id'], Comparator.NOT_EXISTS],
      entities: { user: { id: null } },
      result: true,
    },
    {
      name: `${Comparator.NOT_EXISTS} miss`,
      condition: [['user', 'id'], Comparator.NOT_EXISTS],
      entities: { user: { id: 'uid1' } },
      result: false,
    },

    // GT
    {
      name: `${Comparator.GT} match`,
      condition: [['user', 'age'], Comparator.GT, 16],
      entities: { user: { age: 18 } },
      result: true,
    },
    {
      name: `${Comparator.GT} miss`,
      condition: [['user', 'age'], Comparator.GT, 18],
      entities: { user: { age: 16 } },
      result: false,
    },
    {
      name: `${Comparator.GT} undefined`,
      condition: [['user', 'age'], Comparator.GT, 18],
      entities: { user: {} },
      result: false,
    },

    // GTE
    {
      name: `${Comparator.GTE} match`,
      condition: [['user', 'age'], Comparator.GTE, 18],
      entities: { user: { age: 18 } },
      result: true,
    },
    {
      name: `${Comparator.GTE} miss`,
      condition: [['user', 'age'], Comparator.GTE, 18],
      entities: { user: { age: 16 } },
      result: false,
    },
    {
      name: `${Comparator.GTE} undefined`,
      condition: [['user', 'age'], Comparator.GTE, 18],
      entities: { user: {} },
      result: false,
    },

    // LT
    {
      name: `${Comparator.LT} match`,
      condition: [['user', 'age'], Comparator.LT, 18],
      entities: { user: { age: 16 } },
      result: true,
    },
    {
      name: `${Comparator.LT} miss`,
      condition: [['user', 'age'], Comparator.LT, 16],
      entities: { user: { age: 18 } },
      result: false,
    },
    {
      name: `${Comparator.LT} undefined`,
      condition: [['user', 'age'], Comparator.LT, 18],
      entities: { user: {} },
      result: false,
    },

    // LTE
    {
      name: `${Comparator.LTE} match`,
      condition: [['user', 'age'], Comparator.LTE, 18],
      entities: { user: { age: 18 } },
      result: true,
    },
    {
      name: `${Comparator.LTE} miss`,
      condition: [['user', 'age'], Comparator.LTE, 16],
      entities: { user: { age: 18 } },
      result: false,
    },
    {
      name: `${Comparator.LTE} undefined`,
      condition: [['user', 'age'], Comparator.LTE, 18],
      entities: { user: {} },
      result: false,
    },

    // REGEX
    {
      name: `${Comparator.REGEX} match`,
      condition: [
        ['user', 'id'],
        Comparator.REGEX,
        {
          type: 'regex',
          pattern: '^uid',
          flags: 'i',
        },
      ],
      entities: { user: { id: 'UID1' } },
      result: true,
    },
    {
      name: `${Comparator.REGEX} miss`,
      condition: [
        ['user', 'id'],
        Comparator.REGEX,
        {
          type: 'regex',
          pattern: '^uid',
          flags: 'i',
        },
      ],
      entities: { user: { id: 'foo' } },
      result: false,
    },
    {
      name: `${Comparator.REGEX} undefined`,
      condition: [
        ['user', 'id'],
        Comparator.REGEX,
        {
          type: 'regex',
          pattern: '^uid',
          flags: 'i',
        },
      ],
      entities: { user: {} },
      result: false,
    },

    // NOT_REGEX
    {
      name: `${Comparator.NOT_REGEX} match`,
      condition: [
        ['user', 'id'],
        Comparator.NOT_REGEX,
        {
          type: 'regex',
          pattern: '^uid',
          flags: 'i',
        },
      ],
      entities: { user: { id: 'foo' } },
      result: true,
    },
    {
      name: `${Comparator.NOT_REGEX} miss`,
      condition: [
        ['user', 'id'],
        Comparator.NOT_REGEX,
        {
          type: 'regex',
          pattern: '^uid',
          flags: 'i',
        },
      ],
      entities: { user: { id: 'uid1' } },
      result: false,
    },
    {
      name: `${Comparator.NOT_REGEX} undefined`,
      condition: [
        ['user', 'id'],
        Comparator.NOT_REGEX,
        {
          type: 'regex',
          pattern: '^uid',
          flags: 'i',
        },
      ],
      entities: { user: {} },
      result: false,
    },

    // BEFORE
    {
      name: `${Comparator.BEFORE} match`,
      condition: [
        ['user', 'createdAt'],
        Comparator.BEFORE,
        '2000-01-01T00:00:00.000Z',
      ],
      entities: { user: { createdAt: '1970-01-01T00:00:00.000Z' } },
      result: true,
    },
    {
      name: `${Comparator.BEFORE} miss`,
      condition: [
        ['user', 'createdAt'],
        Comparator.BEFORE,
        '1970-01-01T00:00:00.000Z',
      ],
      entities: { user: { createdAt: '2000-01-01T00:00:00.000Z' } },
      result: false,
    },
    {
      name: `${Comparator.BEFORE} undefined`,
      condition: [
        ['user', 'createdAt'],
        Comparator.BEFORE,
        '1970-01-01T00:00:00.000Z',
      ],
      entities: { user: {} },
      result: false,
    },

    // AFTER
    {
      name: `${Comparator.AFTER} match`,
      condition: [
        ['user', 'createdAt'],
        Comparator.AFTER,
        '1970-01-01T00:00:00.000Z',
      ],
      entities: { user: { createdAt: '2000-01-01T00:00:00.000Z' } },
      result: true,
    },
    {
      name: `${Comparator.AFTER} miss`,
      condition: [
        ['user', 'createdAt'],
        Comparator.AFTER,
        '2000-01-01T00:00:00.000Z',
      ],
      entities: { user: { createdAt: '1970-01-01T00:00:00.000Z' } },
      result: false,
    },
    {
      name: `${Comparator.AFTER} undefined`,
      condition: [
        ['user', 'createdAt'],
        Comparator.AFTER,
        '2000-01-01T00:00:00.000Z',
      ],
      entities: { user: {} },
      result: false,
    },
  ])('should evaluate comparator $name', ({ condition, entities, result }) => {
    expect(
      evaluate({
        definition: {
          seed: undefined,
          environments: {
            production: {
              rules: [{ conditions: [condition], outcome: 1 }],
              fallthrough: 0,
            },
          },
          variants: [false, true],
        } satisfies Packed.FlagDefinition,
        environment: 'production',
        entities,
      }),
    ).toEqual({
      value: result,
      reason: result
        ? ResolutionReason.RULE_MATCH
        : ResolutionReason.FALLTHROUGH,
      outcomeType: OutcomeType.VALUE,
    });
  });

  describe('splits', () => {
    it.each<{
      name: string;
      seed: number;
      split: Packed.SplitOutcome;
      variants: Packed.FlagDefinition['variants'];
      entities: Record<string, unknown> | undefined;
      result: boolean | string;
    }>([
      {
        name: 'shows the default when the entity does not exist',
        seed: 7,
        split: {
          type: 'split',
          base: ['user', 'id'],
          defaultVariant: 0,
          weights: [0, 10000],
        },
        variants: [false, true],
        entities: {},
        result: false,
      },
      {
        name: 'splits when all traffic goes to the second variant',
        seed: 7,
        split: {
          type: 'split',
          base: ['user', 'id'],
          defaultVariant: 0,
          weights: [0, 10000],
        },
        variants: [false, true],
        entities: { user: { id: 'uid1' } },
        result: true,
      },
      {
        name: 'splits to last when there are many buckets',
        seed: 7,
        split: {
          type: 'split',
          base: ['user', 'id'],
          defaultVariant: 0,
          weights: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000],
        },
        variants: 'abcdefghijlmn'.split(''),
        entities: { user: { id: 'uid1' } },
        result: 'n',
      },
      {
        name: 'splits in between when there are many buckets',
        seed: 7,
        split: {
          type: 'split',
          base: ['user', 'id'],
          defaultVariant: 0,
          weights: [0, 0, 0, 0, 0, 0, 0, 0, 0, 10000, 0, 0, 0],
        },
        variants: 'abcdefghijlmn'.split(''),
        entities: { user: { id: 'uid1' } },
        result: 'j',
      },
      {
        name: 'splits 50/50 to true (seed 7)',
        seed: 7,
        split: {
          type: 'split',
          base: ['user', 'id'],
          defaultVariant: 0,
          weights: [5000, 5000],
        },
        variants: [false, true],
        entities: { user: { id: 'uid1' } },
        result: false,
      },
      {
        name: 'splits 50/50 to false (seed 9)',
        seed: 9,
        split: {
          type: 'split',
          base: ['user', 'id'],
          defaultVariant: 0,
          weights: [5000, 5000],
        },
        variants: [false, true],
        entities: { user: { id: 'uid1' } },
        result: true,
      },
    ])('$name', ({ split, seed, variants, entities, result }) => {
      expect(
        evaluate({
          definition: {
            environments: { production: { fallthrough: split } },
            seed,
            variants,
          } satisfies Packed.FlagDefinition,
          environment: 'production',
          entities,
        }),
      ).toEqual({
        value: result,
        reason: ResolutionReason.FALLTHROUGH,
        outcomeType: OutcomeType.SPLIT,
      });
    });

    it('distributes more or less evenly with 10k evaluations regardless of weights', () => {
      const getTotals = (weights: number[], seed: number) => {
        const totals = { a: 0, b: 0, c: 0, d: 0 };
        for (let i = 0; i < 10_000; i++) {
          const result = evaluate({
            definition: {
              environments: {
                production: {
                  fallthrough: {
                    type: 'split',
                    base: ['user', 'id'],
                    defaultVariant: 0,
                    weights,
                  },
                },
              },
              variants: ['a', 'b', 'c', 'd'],
              seed,
            } satisfies Packed.FlagDefinition,
            environment: 'production',
            entities: { user: { id: `uid${i}` } },
          }).value as 'a' | 'b' | 'c' | 'd';
          totals[result]++;
        }
        return totals;
      };

      // these show how many people were assigned to each group,
      // an ideal distribution would assign 2500 to each group
      const expectedTotals = {
        a: 2477,
        b: 2602,
        c: 2458,
        d: 2463,
      };
      expect(getTotals([1, 1, 1, 1], 9)).toEqual(expectedTotals);
      expect(getTotals([1000, 1000, 1000, 1000], 9)).toEqual(expectedTotals);
    });
  });
});

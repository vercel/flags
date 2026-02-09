import { xxHash32 as hashInput } from 'js-xxhash';
import {
  Comparator,
  type EvaluationParams,
  type EvaluationResult,
  OutcomeType,
  Packed,
  ResolutionReason,
} from './types';
import { exhaustivenessCheck } from './utils';

type PathArray = (string | number)[];

function getProperty(obj: any, pathArray: PathArray): any {
  return pathArray.reduce((acc: any, key: string | number) => {
    if (acc && key in acc) {
      return acc[key];
    }
    return undefined; // Return undefined if the property is not found
  }, obj);
}

/**
 * Accesses the value of the given lhs on the provided entities.
 *
 * This must return unknown as we don't know what the library users will pass.
 */

function access<T>(lhs: Packed.LHS, params: EvaluationParams<T>): any {
  // we're dealing with an entity
  if (Array.isArray(lhs)) return getProperty(params.entities, lhs);

  // Code should never end up here as the segment accessor is handled
  // earlier in the matchConditions() function.
  if (lhs === Packed.AccessorType.SEGMENT)
    throw new Error('Unexpected segment');

  throw new Error('Accessor not implemented');
}

function isString(input: unknown): input is string {
  return typeof input === 'string';
}

function isNumber(input: unknown): input is number {
  return typeof input === 'number';
}

function isArray(input: unknown): input is unknown[] {
  return Array.isArray(input);
}

function matchTargetList<T>(
  targets: Packed.TargetList,
  params: EvaluationParams<T>,
): boolean {
  for (const [kind, attributes] of Object.entries(targets)) {
    for (const [attribute, values] of Object.entries(attributes)) {
      const entity = access([kind, attribute], params);
      if (isString(entity) && values.includes(entity)) return true;
    }
  }
  return false;
}

function matchSegment<T>(segment: Packed.Segment, params: EvaluationParams<T>) {
  if (segment.include && matchTargetList(segment.include, params)) return true;
  if (segment.exclude && matchTargetList(segment.exclude, params)) return false;
  if (!segment.rules?.length) return false;

  const firstMatchingRule = segment.rules.find((rule) =>
    matchConditions(rule.conditions, params),
  );

  if (!firstMatchingRule) return false;

  return handleSegmentOutcome(params, firstMatchingRule.outcome);
}

function matchSegmentCondition<T>(
  cmp: Comparator,
  rhs: Packed.RHS,
  params: EvaluationParams<T>,
) {
  switch (cmp) {
    case Comparator.EQ: {
      const segment = params.segments?.[rhs as string];
      if (!segment) return false;
      return matchSegment<T>(segment, params);
    }
    case Comparator.NOT_EQ: {
      const segment = params.segments?.[rhs as string];
      if (!segment) return false;
      return !matchSegment<T>(segment, params);
    }
    case Comparator.ONE_OF: {
      if (!isArray(rhs)) return false;
      const segmentIds = rhs;
      return segmentIds.some((segmentId) => {
        const segment = params.segments?.[segmentId];
        if (!segment) return false;
        return matchSegment<T>(segment, params);
      });
    }
    case Comparator.NOT_ONE_OF: {
      const segmentIds = rhs as string[];
      return segmentIds.every((segmentId) => {
        const segment = params.segments?.[segmentId];
        if (!segment) return false;
        return matchSegment<T>(segment, params);
      });
    }
    default:
      throw new Error(`Comparator ${cmp} not implemented for segment`);
  }
}

function matchConditions<T>(
  conditions: Packed.Condition[],
  params: EvaluationParams<T>,
): boolean {
  return conditions.every((condition) => {
    const [lhsAccessor, cmpKey, rhs] = condition;

    if (lhsAccessor === Packed.AccessorType.SEGMENT) {
      return rhs && matchSegmentCondition(cmpKey, rhs, params);
    }

    const lhs = access(lhsAccessor, params);
    try {
      switch (cmpKey) {
        case Comparator.EQ:
          return lhs === rhs;
        case Comparator.NOT_EQ:
          return lhs !== rhs;
        case Comparator.ONE_OF:
          return isArray(rhs) && rhs.includes(lhs);
        case Comparator.NOT_ONE_OF:
          // lhs would be undefined when the value was not provided, in which
          // case we should not match the rule
          return (
            isArray(rhs) && typeof lhs !== 'undefined' && !rhs.includes(lhs)
          );
        case Comparator.CONTAINS_ALL_OF: {
          if (!Array.isArray(rhs) || !Array.isArray(lhs)) return false;

          const lhsSet = new Set(lhs.filter(isString));

          // try to use a set if the lhs is a list of strings - O(1)
          // otherwise we need to iterate over the values - O(n)
          if (lhsSet.size === lhs.length) {
            return rhs.filter(isString).every((item) => lhsSet.has(item));
          }

          // this shouldn't happen since we only allow string[] on the lhs
          return rhs.every((item) => lhs.includes(item));
        }
        case Comparator.CONTAINS_ANY_OF: {
          if (!Array.isArray(rhs) || !Array.isArray(lhs)) return false;

          const rhsSet = new Set(rhs.filter(isString));
          return lhs.some(
            rhsSet.size === rhs.length
              ? // try to use a set if the rhs is a list of strings - O(1)
                (item) => rhsSet.has(item)
              : // otherwise we need to iterate over the values - O(n)
                (item) => rhs.includes(item),
          );
        }
        case Comparator.CONTAINS_NONE_OF: {
          // if the rhs is not an array something went wrong and we should not match
          if (!Array.isArray(rhs)) return false;

          // if it's not an array it doesn't contain any of the values
          if (!Array.isArray(lhs)) return true;

          const rhsSet = new Set(rhs.filter(isString));
          return lhs.every(
            rhsSet.size === rhs.length
              ? // try to use a set if the rhs is a list of strings - O(1)
                (item) => !rhsSet.has(item)
              : // otherwise we need to iterate over the values - O(n)
                (item) => !rhs.includes(item),
          );
        }
        case Comparator.STARTS_WITH:
          return isString(lhs) && isString(rhs) && lhs.startsWith(rhs);
        case Comparator.NOT_STARTS_WITH:
          return isString(lhs) && isString(rhs) && !lhs.startsWith(rhs);
        case Comparator.ENDS_WITH:
          return isString(lhs) && isString(rhs) && lhs.endsWith(rhs);
        case Comparator.NOT_ENDS_WITH:
          return isString(lhs) && isString(rhs) && !lhs.endsWith(rhs);
        case Comparator.EXISTS:
          return lhs !== undefined && lhs !== null;
        case Comparator.NOT_EXISTS:
          return lhs === undefined || lhs === null;
        case Comparator.GT:
          // NaN will return false for any comparisons
          if (lhs === null || lhs === undefined) return false;
          return (isNumber(rhs) || isString(rhs)) && lhs > rhs;
        case Comparator.GTE:
          if (lhs === null || lhs === undefined) return false;
          return (isNumber(rhs) || isString(rhs)) && lhs >= rhs;
        case Comparator.LT:
          if (lhs === null || lhs === undefined) return false;
          return (isNumber(rhs) || isString(rhs)) && lhs < rhs;
        case Comparator.LTE:
          if (lhs === null || lhs === undefined) return false;
          return (isNumber(rhs) || isString(rhs)) && lhs <= rhs;
        case Comparator.REGEX:
          if (
            isString(lhs) &&
            typeof rhs === 'object' &&
            !Array.isArray(rhs) &&
            rhs?.type === 'regex'
          ) {
            return new RegExp(rhs.pattern, rhs.flags).test(lhs);
          }
          return false;

        case Comparator.NOT_REGEX:
          if (
            isString(lhs) &&
            typeof rhs === 'object' &&
            !Array.isArray(rhs) &&
            rhs?.type === 'regex'
          ) {
            return !new RegExp(rhs.pattern, rhs.flags).test(lhs);
          }
          return false;
        case Comparator.BEFORE: {
          if (!isString(lhs) || !isString(rhs)) return false;
          const a = new Date(lhs);
          const b = new Date(rhs);
          // if any date fails to parse getTime will return NaN, which will cause
          // comparisons to fail.
          return a.getTime() < b.getTime();
        }
        case Comparator.AFTER: {
          if (!isString(lhs) || !isString(rhs)) return false;
          const a = new Date(lhs);
          const b = new Date(rhs);
          return a.getTime() > b.getTime();
        }
        default: {
          const _x: never = cmpKey; // exhaustive check
          return false;
        }
      }
    } catch (error) {
      console.error('flags: Error matching conditions', error);
      return false;
    }
  });
}

function sum(list: number[]) {
  return list.reduce((acc, n) => acc + n, 0);
}

function handleSegmentOutcome<T>(
  params: EvaluationParams<T>,
  outcome: Packed.SegmentOutcome,
) {
  // when everyone is flagged in the segment we can return true immediately
  if (outcome === 1) return true;

  switch (outcome.type) {
    case 'split': {
      const lhs = access(outcome.base, params);

      // exclude from segment if the lhs is not a string
      if (typeof lhs !== 'string') return false;

      const maxValue = 100_000;

      // bypass hashing for common values and edges
      if (outcome.passPromille <= 0) return false;
      if (outcome.passPromille >= maxValue) return true;

      const value = hashInput(lhs, params.definition.seed) % maxValue;
      return value < outcome.passPromille;
    }
    default: {
      const { type } = outcome;
      exhaustivenessCheck(type);
    }
  }
}

function getVariant<T>(variants: unknown[], index: number): T {
  if (index < 0 || index >= variants.length) {
    throw new Error(
      `@vercel/flags-core: Invalid variant index ${index}, variants length is ${variants.length}`,
    );
  }
  return variants[index] as T;
}

function handleOutcome<T>(
  params: EvaluationParams<T>,
  outcome: Packed.Outcome,
): {
  value: T;
  outcomeType: OutcomeType;
} {
  if (typeof outcome === 'number') {
    return {
      value: getVariant<T>(params.definition.variants, outcome),
      outcomeType: OutcomeType.VALUE,
    };
  }
  switch (outcome.type) {
    case 'split': {
      const lhs = access(outcome.base, params);
      const defaultOutcome = getVariant<T>(
        params.definition.variants,
        outcome.defaultVariant,
      );

      // serve the default variant if the lhs is not a string
      if (typeof lhs !== 'string') {
        return { value: defaultOutcome, outcomeType: OutcomeType.SPLIT };
      }

      /** 2^32-1 */
      const maxValue = 4_294_967_295;
      /**
       * (xxHash32): turns the string into a number between 0 and 2^32-1 (max uint32 value)
       * Since we know the range of the hash function, we don't use modulo here. If we change
       * the hash function, or if the range changes, we should add a modulo here and/or adjust maxValue.
       */
      const value = hashInput(lhs, params.definition.seed);
      const sumOfWeights = sum(outcome.weights);
      const scaledWeights = outcome.weights.map(
        (weight) => (weight / sumOfWeights) * maxValue,
      );
      const variantIndex = findWeightedIndex(scaledWeights, value, maxValue);
      return {
        value:
          variantIndex === -1
            ? defaultOutcome
            : getVariant<T>(params.definition.variants, variantIndex),
        outcomeType: OutcomeType.SPLIT,
      };
    }
    default: {
      const { type } = outcome;
      exhaustivenessCheck(type);
    }
  }
}

/**
 * Evaluates a single feature flag.
 *
 * This function should never throw for expected errors, instead it returns
 * { reason: Reason.ERROR, errorMessage: ... }.
 *
 * The function can however throw for situations which should not happen under
 * normal circumstances, for example if the environment config is not found.
 */
export function evaluate<T>(
  /**
   * The params used for the evaluation
   */
  params: EvaluationParams<T>,
): EvaluationResult<T> {
  const envConfig = params.definition.environments[params.environment];

  // handle shortcut where a value is a number directly
  if (typeof envConfig === 'number') {
    return Object.assign(handleOutcome<T>(params, envConfig), {
      reason: ResolutionReason.PAUSED as const,
    }) satisfies EvaluationResult<T>;
  }

  if (!envConfig) {
    return {
      reason: ResolutionReason.ERROR,
      errorMessage: `Could not find envConfig for "${params.environment}"`,
      value: params.defaultValue,
    };
  }

  if ('reuse' in envConfig) {
    const reuseEnvConfig = params.definition.environments[envConfig.reuse];

    if (reuseEnvConfig === undefined) {
      // this is an unexpected error as this should have never been saved in
      // the first place
      throw new Error(
        `Could not find envConfig for "${envConfig.reuse}" when reusing`,
      );
    }

    return evaluate<T>({ ...params, environment: envConfig.reuse });
  }

  if (envConfig.targets) {
    const matchedIndex = envConfig.targets.findIndex((targetList) =>
      matchTargetList(targetList, params),
    );

    if (matchedIndex > -1) {
      return Object.assign(handleOutcome<T>(params, matchedIndex), {
        reason: ResolutionReason.TARGET_MATCH as const,
      }) satisfies EvaluationResult<T>;
    }
  }

  const firstMatchingRule = envConfig.rules
    ? envConfig.rules.find((rule) => matchConditions(rule.conditions, params))
    : undefined;

  if (firstMatchingRule) {
    return Object.assign(handleOutcome<T>(params, firstMatchingRule.outcome), {
      reason: ResolutionReason.RULE_MATCH as const,
    }) satisfies EvaluationResult<T>;
  }

  return Object.assign(handleOutcome<T>(params, envConfig.fallthrough), {
    reason: ResolutionReason.FALLTHROUGH as const,
  }) satisfies EvaluationResult<T>;
}

/**
 * Find the weighted index that the given value falls into.
 *
 * Takes a set of weights that add up to maxValue, and returns the index
 * that corresponds to the given value.
 *
 * @returns index or -1
 */
export function findWeightedIndex(
  weights: number[],
  value: number,
  maxValue: number,
): number {
  if (value < 0 || value >= maxValue) return -1;

  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i] as number;
    if (value < sum) return i;
  }

  return -1;
}

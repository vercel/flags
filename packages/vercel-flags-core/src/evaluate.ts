import { xxHash32 as hashInput } from 'js-xxhash';
import {
  Comparator,
  type EvaluationParams,
  type EvaluationResult,
  OutcomeType,
  Packed,
  ResolutionReason,
  type VariantId,
} from './types';

type PathArray = (string | number)[];

const MAX_REGEX_INPUT_LENGTH = 10_000;

/**
 * Number of buckets that traffic-splitting hashes into.
 *
 * Splits, rollouts, and segment splits all fold the 32-bit hash into
 * `[0, SPLIT_BUCKET_COUNT)` with a modulo and compare against integer
 * thresholds (weights for splits, promille for rollouts and segments — promille
 * is already expressed out of 100_000). Working in this integer space — rather
 * than scaling floats over the full uint32 range — has two properties we rely
 * on: every hash lands in a bucket (there is no unassigned top value that would
 * fall through to a default), and a rollout at promille `p` is bucket-for-bucket
 * identical to the equivalent split. That identity is what lets a flag switch
 * between split and rollout without reassigning anyone.
 */
const SPLIT_BUCKET_COUNT = 100_000;

/** Folds the hash of `lhs` into a bucket in `[0, SPLIT_BUCKET_COUNT)`. */
function splitBucket(lhs: string, seed: number): number {
  return hashInput(lhs, seed) % SPLIT_BUCKET_COUNT;
}

// Per-object memoization cache keyed by the rhs regex objects from the datafile.
// Using a WeakMap (instead of mutating the objects with symbol-keyed props)
// keeps datafile objects pristine so they serialize cleanly across the RSC
// server/client boundary. Entries are GC'd when the datafile is dropped.
const compiledRegexCache = new WeakMap<object, RegExp>();

function getCompiledRegex(rhs: { pattern: string; flags: string }): RegExp {
  const cached = compiledRegexCache.get(rhs);
  if (cached) return cached;
  const compiled = new RegExp(rhs.pattern, rhs.flags);
  compiledRegexCache.set(rhs, compiled);
  return compiled;
}

function exhaustivenessCheck(_: never): never {
  throw new Error('Exhaustiveness check failed');
}

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

function lower<T>(input: T): T {
  if (typeof input === 'string') return input.toLowerCase() as T;
  if (Array.isArray(input)) return input.map(lower) as T;
  return input;
}

const IGNORE_CASE_COMPARATORS: ReadonlySet<Comparator> = new Set([
  Comparator.EQ,
  Comparator.NOT_EQ,
  Comparator.ONE_OF,
  Comparator.NOT_ONE_OF,
  Comparator.CONTAINS_ALL_OF,
  Comparator.CONTAINS_ANY_OF,
  Comparator.CONTAINS_NONE_OF,
  Comparator.STARTS_WITH,
  Comparator.NOT_STARTS_WITH,
  Comparator.ENDS_WITH,
  Comparator.NOT_ENDS_WITH,
  Comparator.CONTAINS,
  Comparator.NOT_CONTAINS,
]);

function matchTargetList<T>(
  targets: Packed.TargetList,
  params: EvaluationParams<T>,
): boolean {
  for (const kind in targets) {
    const attributes = targets[kind]!;
    for (const attribute in attributes) {
      const entity = access([kind, attribute], params);
      if (isString(entity) && attributes[attribute]!.includes(entity))
        return true;
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
        return !matchSegment<T>(segment, params);
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
    const [lhsAccessor, cmpKey, rawRhs, options] = condition;
    const hasIgnoreCaseFlag =
      typeof options === 'string' && options.includes('i');
    const hasIgnoreCaseOption =
      typeof options === 'object' && options !== null && options.i === true;
    const ignoreCase =
      IGNORE_CASE_COMPARATORS.has(cmpKey) &&
      (hasIgnoreCaseFlag || hasIgnoreCaseOption);

    // ignoreCase is not applicable to segment conditions (segments are internal IDs)
    if (lhsAccessor === Packed.AccessorType.SEGMENT) {
      return rawRhs && matchSegmentCondition(cmpKey, rawRhs, params);
    }

    const lhs = ignoreCase
      ? lower(access(lhsAccessor, params))
      : access(lhsAccessor, params);
    const rhs = ignoreCase ? lower(rawRhs) : rawRhs;

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
        case Comparator.CONTAINS:
          return isString(lhs) && isString(rhs) && lhs.includes(rhs);
        case Comparator.NOT_CONTAINS:
          return isString(lhs) && isString(rhs) && !lhs.includes(rhs);
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
            lhs.length <= MAX_REGEX_INPUT_LENGTH &&
            typeof rhs === 'object' &&
            !Array.isArray(rhs) &&
            rhs?.type === 'regex'
          ) {
            return getCompiledRegex(rhs).test(lhs);
          }
          return false;

        case Comparator.NOT_REGEX:
          if (
            isString(lhs) &&
            lhs.length <= MAX_REGEX_INPUT_LENGTH &&
            typeof rhs === 'object' &&
            !Array.isArray(rhs) &&
            rhs?.type === 'regex'
          ) {
            return !getCompiledRegex(rhs).test(lhs);
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

      // bypass hashing for common values and edges
      if (outcome.passPromille <= 0) return false;
      if (outcome.passPromille >= SPLIT_BUCKET_COUNT) return true;

      return splitBucket(lhs, params.definition.seed) < outcome.passPromille;
    }
    default: {
      const { type } = outcome;
      exhaustivenessCheck(type);
    }
  }
}

function getVariant<T>(
  definition: Packed.FlagDefinition,
  index: number,
): { value: T; variantId: VariantId | null } {
  const { variants, variantIds } = definition;

  if (index < 0 || index >= variants.length) {
    throw new Error(
      `@vercel/flags-core: Invalid variant index ${index}, variants length is ${variants.length}`,
    );
  }

  let variantId: VariantId | null = null;
  if (variantIds && index < variantIds.length) {
    variantId = variantIds[index] ?? null;
  }

  return {
    value: variants[index] as T,
    variantId,
  };
}

function handleOutcome<T>(
  params: EvaluationParams<T>,
  outcome: Packed.Outcome,
): {
  value: T;
  outcomeType: OutcomeType;
  variantId: VariantId | null;
} {
  if (typeof outcome === 'number') {
    const variant = getVariant<T>(params.definition, outcome);
    return {
      ...variant,
      outcomeType: OutcomeType.VALUE,
    };
  }
  switch (outcome.type) {
    case 'split': {
      const lhs = access(outcome.base, params);
      const defaultOutcome = getVariant<T>(
        params.definition,
        outcome.defaultVariant,
      );

      // serve the default variant if the lhs is not a string
      if (typeof lhs !== 'string') {
        return {
          ...defaultOutcome,
          outcomeType: OutcomeType.SPLIT,
        };
      }

      const bucket = splitBucket(lhs, params.definition.seed);
      const total = sum(outcome.weights);

      // Walk the weights in variant-index order and return the first variant
      // whose cumulative weight covers the bucket. The comparison is
      // cross-multiplied to stay in integer arithmetic (no floats, no rounding):
      //   bucket / SPLIT_BUCKET_COUNT < cumulative / total
      //   ⟺ bucket * total < cumulative * SPLIT_BUCKET_COUNT
      let cumulative = 0;
      for (let index = 0; index < outcome.weights.length; index++) {
        cumulative += outcome.weights[index] as number;
        if (bucket * total < cumulative * SPLIT_BUCKET_COUNT) {
          return {
            ...getVariant<T>(params.definition, index),
            outcomeType: OutcomeType.SPLIT,
          };
        }
      }

      // Only reached when the weights sum to 0 (no bucket claims any traffic).
      return {
        ...defaultOutcome,
        outcomeType: OutcomeType.SPLIT,
      };
    }
    case 'rollout': {
      const lhs = access(outcome.base, params);
      const defaultOutcome = getVariant<T>(
        params.definition,
        outcome.defaultVariant,
      );

      // serve the default variant if the lhs is not a string
      if (typeof lhs !== 'string') {
        return { ...defaultOutcome, outcomeType: OutcomeType.ROLLOUT };
      }

      // Determine active slot based on elapsed time
      const now = Date.now();
      const elapsed = now - outcome.startTimestamp;

      const rollFromVariant = getVariant<T>(
        params.definition,
        outcome.rollFromVariant,
      );

      // Before rollout starts or no slots, serve rollFromVariant
      if (elapsed < 0 || outcome.slots.length === 0) {
        return {
          ...rollFromVariant,
          outcomeType: OutcomeType.ROLLOUT,
        };
      }

      // Walk slots to find current promille.
      // Each slot's durationMs is how long that slot is served before
      // moving to the next one. Once all slots are exhausted the
      // rollout is complete (100% to rollToVariant).
      let cumulativeDuration = 0;
      let currentPromille = 0;
      let exhausted = true;
      for (const [promille, durationMs] of outcome.slots) {
        currentPromille = promille;
        cumulativeDuration += durationMs;
        if (cumulativeDuration > elapsed) {
          exhausted = false;
          break;
        }
      }
      if (exhausted) currentPromille = 100_000;

      // short-circuit common edges
      if (currentPromille <= 0) {
        return {
          ...rollFromVariant,
          outcomeType: OutcomeType.ROLLOUT,
        };
      }
      const rollToVariant = getVariant<T>(
        params.definition,
        outcome.rollToVariant,
      );
      if (currentPromille >= 100_000) {
        return {
          ...rollToVariant,
          outcomeType: OutcomeType.ROLLOUT,
        };
      }

      const bucket = splitBucket(lhs, params.definition.seed);

      // A rollout at promille `p` is exactly the split
      // { rollFromVariant: SPLIT_BUCKET_COUNT - p, rollToVariant: p }, laid out
      // with the same integer bucketing. So rollTo occupies the low buckets
      // `[0, p)` when it is the lower-index variant (matching where the split
      // would place it), otherwise rollFrom holds the low buckets and rollTo
      // takes the top `[SPLIT_BUCKET_COUNT - p, SPLIT_BUCKET_COUNT)`. Because
      // `p` is already expressed out of SPLIT_BUCKET_COUNT and the bucket space
      // is exactly SPLIT_BUCKET_COUNT wide, every bucket is assigned and the
      // boundary matches the split bucket-for-bucket — switching outcome type
      // reassigns nobody.
      if (outcome.rollToVariant < outcome.rollFromVariant) {
        return {
          ...(bucket < currentPromille ? rollToVariant : rollFromVariant),
          outcomeType: OutcomeType.ROLLOUT,
        };
      }
      return {
        ...(bucket < SPLIT_BUCKET_COUNT - currentPromille
          ? rollFromVariant
          : rollToVariant),
        outcomeType: OutcomeType.ROLLOUT,
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
  /** Tracks visited environments to detect circular reuse. */
  _visited?: Set<string>,
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
      variantId: null,
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

    const visited = _visited ?? new Set<string>();
    if (visited.has(envConfig.reuse)) {
      return {
        reason: ResolutionReason.ERROR,
        errorMessage: `Circular environment reuse detected: "${envConfig.reuse}"`,
        value: params.defaultValue,
        variantId: null,
      };
    }
    visited.add(params.environment);

    return evaluate<T>({ ...params, environment: envConfig.reuse }, visited);
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

export type BulkEvaluationInput<T> = {
  definition: Packed.FlagDefinition;
  defaultValue?: T;
};

/**
 * Evaluates multiple feature flags against the same entities, segments, and
 * environment.
 *
 * Reuses a single shared `EvaluationParams` object across flags so callers
 * avoid the overhead of constructing one per call (and don't need to spawn
 * parallel promises just to fan out independent sync evaluations).
 */
export function bulkEvaluate<T = unknown>(
  flags: Record<string, BulkEvaluationInput<T>>,
  shared: {
    entities?: Record<string, unknown>;
    environment: string;
    segments?: EvaluationParams<T>['segments'];
  },
): Record<string, EvaluationResult<T>> {
  const params: EvaluationParams<T> = {
    entities: shared.entities,
    environment: shared.environment,
    segments: shared.segments,
    definition: undefined as unknown as Packed.FlagDefinition,
    defaultValue: undefined,
  };

  const results: Record<string, EvaluationResult<T>> = {};
  for (const key in flags) {
    const flag = flags[key]!;
    params.definition = flag.definition;
    params.defaultValue = flag.defaultValue;
    results[key] = evaluate<T>(params);
  }
  return results;
}

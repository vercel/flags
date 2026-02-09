/**
 * Options for stream connection behavior
 */
export type StreamOptions = {
  /** Timeout in ms to wait for initial stream connection before falling back */
  initTimeoutMs: number;
};

/**
 * Options for polling behavior
 */
export type PollingOptions = {
  /** Interval in ms between polling requests */
  intervalMs: number;
  /** Timeout in ms to wait for initial poll before falling back */
  initTimeoutMs: number;
};

/** Input type for creating a datafile (without metrics) */
export type DatafileInput = Packed.Data & {
  /**
   * If a data source is used with a specific sdk key then
   * the sdk key or data source might contain information
   * about the environment to be evaluated
   */
  environment: string;
  /** Vercel project id of the source of these flags  */
  projectId: string;
};

/** Datafile with metrics attached (returned by the client) */
export type Datafile = DatafileInput & {
  /** Metrics about how the data was retrieved */
  metrics: Metrics;
};

/** Flag Definitions of a Vercel project */
export type BundledDefinitions = DatafileInput & {
  /** when the data was last updated */
  configUpdatedAt: number;
  /** hash of the data */
  digest: string;
  /** version number of the dat */
  revision: number;
};

export type BundledDefinitionsResult =
  | { definitions: BundledDefinitions; state: 'ok' }
  | { definitions: null; state: 'missing-file' | 'missing-entry' }
  | { definitions: null; state: 'unexpected-error'; error: unknown };

/**
 * Metrics about how data was retrieved and evaluated
 */
export type Metrics = {
  /** Time in ms to read the datafile */
  readMs: number;
  /** Where the data came from */
  source: 'in-memory' | 'embedded' | 'remote';
  /** Whether data was already cached, or stale (fallback used) */
  cacheStatus: 'HIT' | 'MISS' | 'STALE';
  /** Whether the stream is currently connected */
  connectionState: 'connected' | 'disconnected';
  /** Time in ms for the pure flag evaluation logic (only present on EvaluationResult) */
  evaluationMs?: number;
};

/**
 * DataSource interface for the Vercel Flags client
 */
export interface DataSource {
  /**
   * Initialize the data source by fetching the initial file or setting up polling or
   * subscriptions.
   *
   * @see https://openfeature.dev/specification/sections/providers#requirement-241
   */
  initialize: () => Promise<void>;

  /**
   * Returns the in-memory data file, which was loaded from initialize and maybe updated from streams.
   */
  read(): Promise<Datafile>;

  /**
   * End polling or subscriptions. Flush any remaining data.
   */
  shutdown(): void;

  /**
   * Return the actual datafile containing flag definitions.
   */
  getDatafile(): Promise<Datafile>;

  /**
   * Returns the bundled fallback definitions.
   * Throws FallbackNotFoundError if the fallback file doesn't exist.
   * Throws FallbackEntryNotFoundError if the file exists but has no entry for the SDK key.
   */
  getFallbackDatafile?(): Promise<BundledDefinitions>;
}

export type Source = {
  orgId: string;
  orgSlug: string;
  projectId: string;
  projectSlug: string;
};

/**
 * A client for Vercel Flags
 */
export type FlagsClient = {
  /**
   * Origin information for this client (provider and sdkKey)
   */
  origin?: {
    provider: string;
    sdkKey: string;
  };
  /**
   * Evaluate a feature flag
   *
   * Requires initialize() to have been called and awaited first.
   *
   * @param flagKey
   * @param defaultValue
   * @param entities
   * @returns
   */
  evaluate: <T = Value, E = Record<string, unknown>>(
    flagKey: string,
    defaultValue?: T,
    entities?: E,
  ) => Promise<EvaluationResult<T>>;
  /**
   * Retrieve the latest datafile during startup, and set up subscriptions if needed.
   */
  initialize(): void | Promise<void>;
  /**
   * Facilitates a clean shutdown process which may include flushing telemetry information, or closing remote connections.
   */
  shutdown(): void | Promise<void>;
  /**
   * Returns the actual datafile containing flag definitions
   */
  getDatafile(): Promise<Datafile>;
  /**
   * Returns the bundled fallback definitions.
   * Throws FallbackNotFoundError if the fallback file doesn't exist.
   * Throws FallbackEntryNotFoundError if the file exists but has no entry for the SDK key.
   */
  getFallbackDatafile(): Promise<BundledDefinitions>;
};

export type EvaluationParams<T> = {
  entities?: Record<string, unknown>;
  environment: string;
  segments?: Record<SegmentId, Packed.Segment>;
  definition: Packed.FlagDefinition;
  defaultValue?: T;
};

// Copied from the OpenFeature ErrorCode and commented out unused types
/**
 * ErrorCodes that can happen during evaluation
 */
export enum ErrorCode {
  /**
   * The value was resolved before the provider was ready.
   */
  // PROVIDER_NOT_READY = 'PROVIDER_NOT_READY',
  /**
   * The provider has entered an irrecoverable error state.
   */
  // PROVIDER_FATAL = 'PROVIDER_FATAL',
  /**
   * The flag could not be found.
   */
  FLAG_NOT_FOUND = 'FLAG_NOT_FOUND',
  /**
   * An error was encountered parsing data, such as a flag configuration.
   */
  // PARSE_ERROR = 'PARSE_ERROR',
  /**
   * The type of the flag value does not match the expected type.
   */
  // TYPE_MISMATCH = 'TYPE_MISMATCH',
  /**
   * The provider requires a targeting key and one was not provided in the evaluation context.
   */
  // TARGETING_KEY_MISSING = 'TARGETING_KEY_MISSING',
  /**
   * The evaluation context does not meet provider requirements.
   */
  // INVALID_CONTEXT = 'INVALID_CONTEXT',
  /**
   * An error with an unspecified code.
   */
  // GENERAL = 'GENERAL',
}

/**
 * The detailed result of a flag evaluation as returned by the client's `evaluate` function.
 */
export type EvaluationResult<T> =
  | {
      /**
       * In case of successful evaluations this holds the evaluated value
       */
      value: T;
      /**
       * Indicates whether the outcome was a single variant or a split
       */
      outcomeType?: OutcomeType;
      /**
       * Indicates why the flag evaluated to a certain value
       */
      reason: Exclude<ResolutionReason, ResolutionReason.ERROR>;
      errorMessage?: never;
      errorCode?: never;
      /** Metrics about the evaluation (optional) */
      metrics?: Metrics;
    }
  | {
      reason: ResolutionReason.ERROR;
      errorMessage: string;
      errorCode?: ErrorCode;
      outcomeType?: never;
      /**
       * In cases of errors this is the defaultValue if one was provided
       */
      value?: T;
      /** Metrics about the evaluation (optional) */
      metrics?: Metrics;
    };

export type FlagKey = string;
export type VariantId = string;
export type EnvironmentKey = string;
export type SegmentId = string;
export type Value = string | number | boolean;

export enum ResolutionReason {
  PAUSED = 'paused',
  TARGET_MATCH = 'target_match',
  RULE_MATCH = 'rule_match',
  FALLTHROUGH = 'fallthrough',
  ERROR = 'error',
}

export enum OutcomeType {
  /** When the outcome type was a single variant */
  VALUE = 'value',
  /** When the outcome type was a split */
  SPLIT = 'split',
}

/**
 * Vercel Flags
 * - is equal to (eq)
 * - is not equal to (!eq)
 * - is one of (oneOf)
 * - is not one of (!oneOf)
 * - contains (contains)
 * - does not contain (!contains)
 * - starts with (startsWith)
 * - does not start with (!startsWith)
 * - ends with (endsWith)
 * - does not end with (!endsWith)
 * - exists (ex)
 * - deos not exist (!ex)
 * - is greater than (gt)
 * - is greater than or equal to (gte)
 * - is lower than (lt)
 * - is lower than or equal to (lte)
 * - matches regex (regex)
 * - does not match regex (!regex)
 * - is before (before)
 * - is after (after)
 */

export enum Comparator {
  /**
   * lhs must be string | number
   * rhs must be string | number
   * does a strict equality check
   */
  EQ = 'eq',
  /**
   * lhs must be string | number
   * rhs must be string | number
   * does a strict equality check
   */
  NOT_EQ = '!eq',
  /**
   * lhs must be string
   * rhs must be string[]
   */
  ONE_OF = 'oneOf',
  /**
   * lhs must be string
   * rhs must be string[]
   */
  NOT_ONE_OF = '!oneOf',
  /**
   * lhs must be string[]
   * rhs must be string[]
   */
  CONTAINS_ALL_OF = 'containsAllOf',
  /**
   * lhs must be string[]
   * rhs must be string[]
   */
  CONTAINS_ANY_OF = 'containsAnyOf',
  /**
   * lhs must be string[]
   * rhs must be string[]
   */
  CONTAINS_NONE_OF = 'containsNoneOf',
  /**
   * lhs must be string
   * rhs must be string
   *
   * other comparisons have to be handled with a regex
   */
  STARTS_WITH = 'startsWith',
  /**
   * lhs must be string
   * rhs must be string
   *
   * other comparisons have to be handled with a regex
   */
  NOT_STARTS_WITH = '!startsWith',
  /**
   * lhs must be string
   * rhs must be string
   *
   * other comparisons have to be handled with a regex
   */
  ENDS_WITH = 'endsWith',
  /**
   * lhs must be string
   * rhs must be string
   *
   * other comparisons have to be handled with a regex
   */
  NOT_ENDS_WITH = '!endsWith',
  /**
   * lhs must be string
   * rhs must be never
   */
  EXISTS = 'ex',
  /**
   * lhs must be string
   * rhs must be never
   */
  NOT_EXISTS = '!ex',
  /**
   * lhs must be string | number
   * rhs must be string | number
   */
  GT = 'gt',
  /**
   * lhs must be string | number
   * rhs must be string | number
   */
  GTE = 'gte',
  /** */
  /**
   * lhs must be string | number
   * rhs must be string | number
   */
  LT = 'lt',
  /**
   * lhs must be string | number
   * rhs must be string | number
   */
  LTE = 'lte',
  /**
   * lhs must be string
   * rhs must be string
   */
  REGEX = 'regex',
  /**
   * lhs must be string
   * rhs must be string
   */
  NOT_REGEX = '!regex',
  /**
   * lhs must be date string
   * rhs must be date string
   *
   * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_time_string_format
   */
  BEFORE = 'before',
  /**
   * lhs must be date string
   * rhs must be date string
   *
   * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_time_string_format
   */
  AFTER = 'after',
}

// -----------------------------------------------------------------------------
// Original data
// -----------------------------------------------------------------------------

export namespace Original {
  export type Data = {
    definitions: Record<string, FlagDefinition>;
    segments?: Original.Segment[];
  };

  export enum AccessorType {
    SEGMENT = 'segment',
    ENTITY = 'entity',
  }

  export type SegmentOutcome = SegmentAllOutcome | SegmentSplitOutcome;

  export type Outcome =
    | {
        type: 'variant';
        variantId: VariantId;
      }
    | {
        type: 'split';
        /**
         * Based on which attribute the traffic should be split
         */
        base: EntityAccessor;
        /**
         * The distribution for each variant
         */
        weights: Record<VariantId, number>;
        /**
         * This variant will be used when the base attribute does not exist
         */
        defaultVariantId: VariantId;
      };

  export type SegmentAllOutcome = {
    type: 'all';
  };

  export type SegmentSplitOutcome = {
    type: 'split';
    /**
     * Based on which attribute the passing percentage should be split.
     *
     * When the attribute does not exist the segment will not match.
     */
    base: EntityAccessor;
    /**
     * The promille that should pass the segment
     *       1 = 0.001%
     *   1_000 =     1%
     * 100_000 =   100%
     */
    passPromille: number;
  };

  export type EntityAccessor = {
    type: AccessorType.ENTITY;
    kind: string;
    attribute: string;
  };
  export type SegmentAccessor = { type: AccessorType.SEGMENT };

  export type List = {
    // backwards compatibility, we should only use "list" going forward
    type: 'list/inline' | 'list';
    items: { note?: string; value: string | number }[];
    id?: never;
  };

  export type LHS = SegmentAccessor | EntityAccessor;
  export type RHS =
    | string
    | number
    | boolean
    | List
    | { type: 'regex'; pattern: string; flags: string };

  export type Condition = {
    lhs: LHS;
    cmp: Comparator;
    rhs: RHS;
  };

  export type Rule = {
    conditions: Condition[];
    outcome: Outcome;
  };

  export type SegmentRule = {
    conditions: Condition[];
    outcome: SegmentAllOutcome | SegmentSplitOutcome;
  };

  export type FlagVariant = {
    id: string;
    label?: string;
    description?: string;
    value: Value;
  };

  export type EnvironmentConfig = {
    active: boolean;
    pausedOutcome: Outcome;
    /**
     * If enabled, the flag will be reused from the given environment.
     *
     * The flag will not be evaluated, and the outcome will be the same as the given environment.
     * This environment must be active and the flag must be active in this environment.
     */
    reuse: {
      active: boolean;
      environment: EnvironmentKey;
    };
    targets: Record<VariantId, TargetList>;
    rules: Rule[];
    fallthrough: Outcome;
  };

  /**
   * A list of targets
   *
   * @example
   * {
   *   user: { id: { note?: string; value: string }[] }
   * }
   */
  export type TargetList = Record<
    string,
    Record<string, { note?: string; value: string }[]>
  >;

  /**
   * reusable conditions, with no outcome attached
   */
  export type Segment = {
    id: string;
    rules: SegmentRule[];
    /**
     * Explicitly include targets. Included targets will bypass conditions and exclusion.
     *
     * @example
     * include: {
     *   user: { id: { note?: string, value: string }[] }
     * }
     */
    include: TargetList;
    /**
     * Explicitly exclude targets. Excluded targets will not be included in the segment, and bypass conditions.
     *
     * @example
     * exclude: {
     *   user: { id: { note?: string, value: string }[] }
     * }
     */
    exclude: TargetList;
  };

  export type FlagDefinition = {
    variants: FlagVariant[];
    environments: Record<EnvironmentKey, EnvironmentConfig>;

    /**
     * A random seed to prevent split points in different flags
     * from having the same targets. Otherwise the same set of ids would be
     * opted into all flags for every rollout. By using a different seed for
     * each flag the distribution is different for every flag.
     *
     * We don't use the slug as it might change, but we don't want the distribution
     * to change when the slug changes.
     *
     * We don't use the id or createdAt etc as we want to be able to redistirbute
     * by changing the seed.
     */
    seed: number;
  };
}

// -----------------------------------------------------------------------------
// Packed data
// -----------------------------------------------------------------------------

export namespace Packed {
  /**
   * Idenitifies a variant based on its index in the variants array.
   */
  export type VariantIndex = number;

  export type Data = {
    /** map of flag keys to definitions */
    definitions: Record<FlagKey, FlagDefinition>;
    /** segments keyed by id */
    segments?: Record<SegmentId, Segment>;
  };

  export enum AccessorType {
    SEGMENT = 'segment',
    ENTITY = 'entity',
  }

  export type SplitOutcome = {
    type: 'split';
    /**
     * Based on which attribute the traffic should be split.
     */
    base: EntityAccessor;
    /**
     * The distribution of the individual groups.
     *
     * We use a single number array as the numbers will be placed in the
     * same order as the variant list.
     *
     * So index 0 here is the distribution for variant 0, and so on.
     */
    weights: number[];
    /**
     * This variant will be used when the lhs does not exist
     */
    defaultVariant: VariantIndex;
  };

  export type SegmentAllOutcome = 1;

  export type SegmentSplitOutcome = {
    type: 'split';
    /**
     * Based on which attribute the traffic should be split.
     *
     * When the attribute does not exist the segment will not match.
     */
    base: EntityAccessor;
    /**
     * The promille that should pass the segment (1 = 0.001%; 1000 = 1%)
     */
    passPromille: number;
  };

  export type SegmentOutcome = SegmentAllOutcome | SegmentSplitOutcome;

  export type Outcome = VariantIndex | SplitOutcome;

  // an array means it's an entity, the string "segment" means a segment
  export type EntityAccessor = (string | number)[];
  export type SegmentAccessor = 'segment';

  /**
   * An array means an entity
   */
  export type LHS = EntityAccessor | SegmentAccessor;

  /**
   * undefined when the rhs is not used by the comparator
   * string[] when the rhs is a list of segments
   * { type: 'regex'; pattern: string; flags: string } when the rhs is a regex
   */
  export type RHS =
    | undefined
    | string
    | number
    | boolean
    | (string | number)[]
    | { type: 'regex'; pattern: string; flags: string };

  export type Condition =
    | [LHS, Comparator, RHS]
    | [LHS, Comparator.EXISTS]
    | [LHS, Comparator.NOT_EXISTS];

  export type Rule = {
    conditions: Condition[];
    outcome: Outcome;
  };

  export type SegmentRule = {
    conditions: Condition[];
    outcome: SegmentAllOutcome | SegmentSplitOutcome;
  };

  export type EnvironmentConfig =
    /**
     * Paused flags contain the pausedOutcome only.
     */
    | number
    /** Allows reusing the configuration of another environment */
    | { reuse: EnvironmentKey }
    /**
     * Active flags don't contain an explicit "active" state.
     * The fact that they have a config means they are active.
     */
    | {
        /**
         * Each array item represents a variant.
         *
         * Each slot holds the targets for that variant.
         *
         * So the target list at index 0 is the targets for variant 0, and so on.
         */
        targets?: TargetList[];
        rules?: Rule[];
        fallthrough: Outcome;
      };

  /**
   * A list of targets
   *
   * @example
   * {
   *   user: { id: string[] }
   * }
   */
  export type TargetList = Record<string, Record<string, string[]>>;

  /**
   * reusable conditions, with no outcome attached
   */
  export type Segment = {
    rules?: SegmentRule[];
    /**
     * Explicitly include targets. Included targets will bypass conditions and exclusion.
     *
     * @example
     * include: {
     *   user: { id: string[] }
     * }
     */
    include?: TargetList;
    /**
     * Explicitly exclude targets. Excluded targets will not be included in the segment, and bypass conditions.
     *
     * @example
     * exclude: {
     *   user: { id: string[] }
     * }
     */
    exclude?: TargetList;
  };

  export type FlagDefinition = {
    /** for backwards compatibility with HappyKit */
    variantIds?: string[];
    /**  variants, packed down to just their values */
    variants: Value[];
    /**  environments */
    environments: Record<EnvironmentKey, EnvironmentConfig>;
    /**
     * A random seed to prevent split points in different flags
     * from having the same targets. Otherwise the same set of ids would be
     * opted into all flags for every rollout. By using a different seed for
     * each flag the distribution is different for every flag.
     *
     * We don't use the slug as it might change, but we don't want the distribution
     * to change when the slug changes.
     *
     * We don't use the id or createdAt etc as we want to be able to redistirbute
     * by changing the seed.
     */
    seed?: number;
  };
}

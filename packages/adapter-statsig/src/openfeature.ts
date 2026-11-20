import {
  type EvaluationContext,
  type EvaluationContextValue,
  type FlagMetadata,
  FlagNotFoundError,
  GeneralError,
  type JsonValue,
  ParseError,
  type Provider,
  ProviderFatalError,
  ProviderNotReadyError,
  type ResolutionDetails,
  type ResolutionReason,
  StandardResolutionReasons,
  type TrackingEventDetails,
  TypeMismatchError,
} from '@openfeature/server-sdk';
import {
  Statsig,
  type StatsigOptions,
  StatsigUser,
  type StatsigUserArgs,
} from '@statsig/statsig-node-core';

/**
 * The options of `StatsigProvider`.
 */
export interface StatsigProviderOptions {
  /**
   * The options for `new Statsig(sdkKey, options)`. The provider uses them
   * only when it creates the Statsig instance from an SDK key.
   */
  statsigOptions?: StatsigOptions;
  /**
   * Set to `true` to not log exposures for evaluations. By default, Statsig
   * logs an exposure for each check.
   */
  disableExposureLogging?: boolean;
}

/**
 * The kinds of Statsig entities which a flag key can point to.
 */
type EntityKind = 'gate' | 'config' | 'experiment' | 'layer';

/**
 * A flag key, parsed into the kind, the name and an optional parameter.
 */
interface ParsedKey {
  kind: EntityKind;
  name: string;
  param: string | undefined;
}

/**
 * The result of one check in Statsig, independent of the kind.
 */
interface Evaluation {
  /** The value of the gate, or the value object of the other kinds */
  value: boolean | Record<string, unknown>;
  /** Reads one parameter. Logs a layer parameter exposure if needed. */
  readParam: (param: string) => unknown;
  ruleID: string;
  reason: string;
  groupName: string | null;
  allocatedExperimentName: string | null;
}

const KIND_NAMES: Record<EntityKind, string> = {
  gate: 'feature gate',
  config: 'dynamic config',
  experiment: 'experiment',
  layer: 'layer',
};

type ResolveType = 'boolean' | 'string' | 'number' | 'object';

const PREFIXES: Record<string, EntityKind> = {
  gate: 'gate',
  config: 'config',
  experiment: 'experiment',
  layer: 'layer',
};

/**
 * Parses a flag key.
 *
 * - `<gate>` or `gate:<gate>`: a feature gate
 * - `config:<name>[.<param>]`: a dynamic config
 * - `experiment:<name>[.<param>]`: an experiment
 * - `layer:<name>[.<param>]`: a layer
 */
function parseKey(flagKey: string): ParsedKey {
  let kind: EntityKind = 'gate';
  let rest = flagKey;
  const colon = flagKey.indexOf(':');
  if (colon !== -1) {
    const prefix = flagKey.slice(0, colon);
    const prefixKind = PREFIXES[prefix];
    if (!prefixKind) {
      throw new ParseError(
        `Unknown prefix "${prefix}" in flag key "${flagKey}". Use gate:, config:, experiment: or layer:.`,
      );
    }
    kind = prefixKind;
    rest = flagKey.slice(colon + 1);
  }

  const dot = rest.indexOf('.');
  const name = dot === -1 ? rest : rest.slice(0, dot);
  const param = dot === -1 ? undefined : rest.slice(dot + 1);
  if (name === '') {
    throw new ParseError(`The flag key "${flagKey}" has no name.`);
  }
  if (param === '') {
    throw new ParseError(`The flag key "${flagKey}" has an empty parameter.`);
  }
  if (kind === 'gate' && param !== undefined) {
    throw new ParseError(
      `The flag key "${flagKey}" reads a parameter of a feature gate. Feature gates have no parameters.`,
    );
  }
  return { kind, name, param };
}

/**
 * Whether Statsig rejected the key. The SDK reports the HTTP status in the
 * message of the error, e.g. `status(401)`.
 */
function isRejectedKey(error: string | null | undefined): boolean {
  return typeof error === 'string' && /status\((401|403)\)/.test(error);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

type CustomValue = string | number | boolean | Array<string | number | boolean>;

/**
 * Converts a context value to a value which a StatsigUser accepts in
 * `custom` or `privateAttributes`. Returns `undefined` for other values.
 */
function toCustomValue(value: unknown): CustomValue | undefined {
  if (isPrimitive(value)) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value) && value.every(isPrimitive)) {
    return value;
  }
  return undefined;
}

function toCustomRecord(value: unknown): Record<string, CustomValue> {
  const record: Record<string, CustomValue> = {};
  if (!isPlainObject(value)) {
    return record;
  }
  for (const [key, entry] of Object.entries(value)) {
    const converted = toCustomValue(entry);
    if (converted !== undefined) {
      record[key] = converted;
    }
  }
  return record;
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      record[key] = entry;
    }
  }
  return record;
}

const STRING_FIELDS = [
  'email',
  'ip',
  'userAgent',
  'country',
  'locale',
  'appVersion',
] as const;

const KNOWN_FIELDS = new Set<string>([
  'targetingKey',
  'userID',
  'custom',
  'customIDs',
  'privateAttributes',
  'statsigEnvironment',
  ...STRING_FIELDS,
]);

/**
 * Converts an OpenFeature evaluation context to the arguments of a
 * StatsigUser. The fields are the same as the fields of the StatsigUser of
 * the v4 adapter, so the same object works as a context.
 *
 * - `targetingKey`, or else `userID`, becomes `userID`
 * - `email`, `ip`, `userAgent`, `country`, `locale`, `appVersion` stay
 * - `custom`, `customIDs`, `privateAttributes`, `statsigEnvironment` stay
 * - other attributes with a primitive value go to `custom`
 */
export function toStatsigUserArgs(context: EvaluationContext): StatsigUserArgs {
  const args: StatsigUserArgs = {};

  if (typeof context.targetingKey === 'string') {
    args.userID = context.targetingKey;
  } else if (typeof context.userID === 'string') {
    args.userID = context.userID;
  }

  for (const field of STRING_FIELDS) {
    const value = context[field];
    if (typeof value === 'string') {
      args[field] = value;
    }
  }

  const customIDs = toStringRecord(context.customIDs);
  if (customIDs) {
    args.customIDs = customIDs;
  }

  const statsigEnvironment = toStringRecord(context.statsigEnvironment);
  if (statsigEnvironment) {
    args.statsigEnvironment = statsigEnvironment;
  }

  if (isPlainObject(context.privateAttributes)) {
    args.privateAttributes = toCustomRecord(context.privateAttributes);
  }

  const custom: Record<string, CustomValue> = toCustomRecord(context.custom);
  for (const [key, value] of Object.entries(context)) {
    if (KNOWN_FIELDS.has(key)) {
      continue;
    }
    const converted = toCustomValue(value as EvaluationContextValue);
    // A value in `custom` wins over a top-level attribute of the same name
    if (converted !== undefined && !(key in custom)) {
      custom[key] = converted;
    }
  }
  if (Object.keys(custom).length > 0) {
    args.custom = custom;
  }

  return args;
}

function typeOf(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function hasResolveType(value: unknown, type: ResolveType): boolean {
  if (type === 'object') {
    return typeof value === 'object' && value !== null;
  }
  return typeof value === type;
}

/**
 * An OpenFeature server provider for Statsig. It uses the Statsig Server
 * Core SDK (`@statsig/statsig-node-core`).
 *
 * The flag key selects the Statsig entity:
 *
 * - `my_gate` (or `gate:my_gate`): the value of a feature gate
 * - `config:my_config`: the value object of a dynamic config
 * - `experiment:my_experiment`: the value object of an experiment
 * - `layer:my_layer`: the value object of a layer
 *
 * A `.<param>` suffix reads one parameter, e.g. `experiment:pricing.price`.
 *
 * ```ts
 * import { OpenFeature } from '@openfeature/server-sdk';
 * import { StatsigProvider } from '@flags-sdk/statsig/openfeature';
 *
 * await OpenFeature.setProviderAndWait(
 *   new StatsigProvider(process.env.STATSIG_SERVER_API_KEY ?? ''),
 * );
 * ```
 */
export class StatsigProvider implements Provider {
  readonly metadata = { name: 'statsig' } as const;
  readonly runsOn = 'server';

  /** The Statsig instance which the provider uses. */
  readonly statsig: Statsig;

  /** The provider shuts down only an instance which it created. */
  private readonly ownsInstance: boolean;
  private readonly disableExposureLogging: boolean;
  private readonly users = new WeakMap<EvaluationContext, StatsigUser>();

  /**
   * @param sdkKeyOrStatsig A Statsig server secret key, or a Statsig
   * instance. With a key, the provider creates the instance. Creating it
   * does not open a connection: the SDK fetches the rules in `initialize()`.
   * @param options The options of the provider.
   */
  constructor(
    sdkKeyOrStatsig: string | Statsig,
    options: StatsigProviderOptions = {},
  ) {
    if (typeof sdkKeyOrStatsig === 'string') {
      this.statsig = new Statsig(sdkKeyOrStatsig, options.statsigOptions);
      this.ownsInstance = true;
    } else {
      this.statsig = sdkKeyOrStatsig;
      this.ownsInstance = false;
    }
    this.disableExposureLogging = options.disableExposureLogging ?? false;
  }

  /**
   * Initializes the Statsig instance. It fetches the rules from Statsig.
   * The provider also calls this for an instance which it did not create.
   * Statsig accepts a second call.
   *
   * A key which Statsig rejects (401 or 403) is a fatal error: the key does
   * not become valid by itself, so the SDK does not try again. Other
   * errors, e.g. of the network, are tried again on the next use.
   */
  async initialize(): Promise<void> {
    const result = await this.statsig.initialize();
    if (result.isSuccess) {
      return;
    }
    const message = `Statsig could not initialize: ${result.error ?? 'unknown error'}`;
    if (isRejectedKey(result.error)) {
      throw new ProviderFatalError(
        `${message}. Check the Statsig server secret key.`,
      );
    }
    throw new GeneralError(message);
  }

  /**
   * Shuts down the Statsig instance and flushes the events. The provider
   * shuts down only an instance which it created. You shut down an instance
   * which you gave to the provider.
   */
  async onClose(): Promise<void> {
    if (!this.ownsInstance) {
      return;
    }
    await this.statsig.shutdown();
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.resolve(flagKey, 'boolean', defaultValue, context);
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.resolve(flagKey, 'string', defaultValue, context);
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.resolve(flagKey, 'number', defaultValue, context);
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    return this.resolve(flagKey, 'object', defaultValue, context);
  }

  /**
   * Logs an event to Statsig with `logEvent`. `details.value` becomes the
   * value of the event. The other details become its metadata.
   */
  track(
    trackingEventName: string,
    context: EvaluationContext,
    details: TrackingEventDetails = {},
  ): void {
    const { value, ...rest } = details;
    const metadata: Record<string, string | number | boolean> = {};
    for (const [key, entry] of Object.entries(rest)) {
      if (isPrimitive(entry)) {
        metadata[key] = entry;
      } else if (entry instanceof Date) {
        metadata[key] = entry.toISOString();
      } else if (entry !== undefined && entry !== null) {
        metadata[key] = JSON.stringify(entry);
      }
    }
    this.statsig.logEvent(
      this.userOf(context),
      trackingEventName,
      typeof value === 'number' ? value : null,
      Object.keys(metadata).length > 0 ? metadata : null,
    );
  }

  private userOf(context: EvaluationContext): StatsigUser {
    const cached = this.users.get(context);
    if (cached) {
      return cached;
    }
    const args = toStatsigUserArgs(context);
    const user = new StatsigUser(
      args as ConstructorParameters<typeof StatsigUser>[0],
    );
    this.users.set(context, user);
    return user;
  }

  private evaluate(parsed: ParsedKey, user: StatsigUser): Evaluation {
    const options = { disableExposureLogging: this.disableExposureLogging };
    const { kind, name } = parsed;

    if (kind === 'gate') {
      const gate = this.statsig.getFeatureGate(user, name, options);
      return {
        value: gate.value,
        readParam: () => undefined,
        ruleID: gate.ruleID,
        reason: gate.details.reason,
        groupName: null,
        allocatedExperimentName: null,
      };
    }
    if (kind === 'config') {
      const config = this.statsig.getDynamicConfig(user, name, options);
      return {
        value: config.value,
        readParam: (param) => config.value[param],
        ruleID: config.ruleID,
        reason: config.details.reason,
        groupName: null,
        allocatedExperimentName: null,
      };
    }
    if (kind === 'experiment') {
      const experiment = this.statsig.getExperiment(user, name, options);
      return {
        value: experiment.value,
        readParam: (param) => experiment.value[param],
        ruleID: experiment.ruleID,
        reason: experiment.details.reason,
        groupName: experiment.groupName,
        allocatedExperimentName: null,
      };
    }
    const layer = this.statsig.getLayer(user, name, options);
    return {
      // Not read: a layer key always has a parameter
      value: {},
      // getValue logs the exposure of the parameter, if exposures are on
      readParam: (param) => layer.getValue(param),
      ruleID: layer.ruleID,
      reason: layer.details.reason,
      groupName: layer.groupName,
      allocatedExperimentName: layer.allocatedExperimentName,
    };
  }

  private resolve<T>(
    flagKey: string,
    type: ResolveType,
    defaultValue: T,
    context: EvaluationContext,
  ): ResolutionDetails<T> {
    const parsed = parseKey(flagKey);
    const kindName = KIND_NAMES[parsed.kind];

    if (parsed.kind === 'gate' && type !== 'boolean') {
      throw new TypeMismatchError(
        `"${flagKey}" is a feature gate, which is a boolean. Use a config:, experiment: or layer: key with a parameter for a ${type}.`,
      );
    }
    if (parsed.kind === 'layer' && parsed.param === undefined) {
      // Statsig gives a layer only by parameter, so that each parameter has
      // its own exposure
      throw new ParseError(
        `"${flagKey}" is a layer. Add a .<param> suffix to read one of its parameters.`,
      );
    }
    if (
      parsed.kind !== 'gate' &&
      parsed.param === undefined &&
      type !== 'object'
    ) {
      throw new TypeMismatchError(
        `"${flagKey}" is the value object of a ${kindName}. Add a .<param> suffix to read a ${type}.`,
      );
    }

    const evaluation = this.evaluate(parsed, this.userOf(context));
    const statsigReason = evaluation.reason;

    if (statsigReason.endsWith(':Unrecognized')) {
      throw new FlagNotFoundError(
        `The ${kindName} "${parsed.name}" does not exist in Statsig.`,
      );
    }
    if (statsigReason === 'Uninitialized' || statsigReason === 'NoValues') {
      throw new ProviderNotReadyError(
        `Statsig has no rules (${statsigReason}). Check the SDK key and the initialization.`,
      );
    }

    const flagMetadata = this.metadataOf(evaluation);
    const variant = this.variantOf(evaluation);
    const reason = this.reasonOf(evaluation);

    if (parsed.param === undefined) {
      // A gate is a boolean and the others are objects (checked above)
      return {
        value: evaluation.value as T,
        reason,
        variant,
        flagMetadata,
      };
    }

    const paramValue = evaluation.readParam(parsed.param);
    if (paramValue === undefined || paramValue === null) {
      // The parameter is missing, e.g. for a user outside of an experiment
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
        variant,
        flagMetadata,
      };
    }
    if (!hasResolveType(paramValue, type)) {
      throw new TypeMismatchError(
        `The parameter "${parsed.param}" of the ${kindName} "${parsed.name}" is a ${typeOf(paramValue)}, not a ${type}.`,
      );
    }
    return { value: paramValue as T, reason, variant, flagMetadata };
  }

  private reasonOf(evaluation: Evaluation): ResolutionReason {
    if (evaluation.reason.startsWith('LocalOverride')) {
      return StandardResolutionReasons.STATIC;
    }
    if (evaluation.ruleID === 'disabled') {
      return StandardResolutionReasons.DISABLED;
    }
    if (evaluation.ruleID === 'default' || evaluation.ruleID === '') {
      return StandardResolutionReasons.DEFAULT;
    }
    if (evaluation.groupName) {
      return StandardResolutionReasons.SPLIT;
    }
    return StandardResolutionReasons.TARGETING_MATCH;
  }

  private variantOf(evaluation: Evaluation): string | undefined {
    if (evaluation.groupName) {
      return evaluation.groupName;
    }
    if (evaluation.ruleID) {
      return evaluation.ruleID;
    }
    return undefined;
  }

  private metadataOf(evaluation: Evaluation): FlagMetadata {
    const metadata: Record<string, string> = {};
    if (evaluation.ruleID) {
      metadata.ruleID = evaluation.ruleID;
    }
    if (evaluation.reason) {
      metadata.statsigReason = evaluation.reason;
    }
    if (evaluation.groupName) {
      metadata.groupName = evaluation.groupName;
    }
    if (evaluation.allocatedExperimentName) {
      metadata.allocatedExperimentName = evaluation.allocatedExperimentName;
    }
    return metadata;
  }
}

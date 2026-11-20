/**
 * An OpenFeature server provider for PostHog, on a client of `posthog-node`.
 *
 * The provider does not import `flags` or `posthog-node`. The application
 * creates the PostHog client and gives it to the provider. The provider uses
 * only the methods of `PostHogClient`, so a client of `posthog-node` 5 or 6
 * fits.
 */

import {
  ErrorCode,
  type EvaluationContext,
  type EvaluationContextValue,
  type JsonValue,
  type Provider,
  type ProviderMetadata,
  type ResolutionDetails,
  type ResolutionReason,
  StandardResolutionReasons,
  TargetingKeyMissingError,
  type TrackingEventDetails,
} from '@openfeature/server-sdk';

/**
 * A primitive value of a person or group property.
 */
export type PostHogPropertyValue = string | number | boolean;

/**
 * The options of one flag evaluation of PostHog.
 */
export interface PostHogEvaluationOptions {
  groups?: Record<string, string>;
  personProperties?: Record<string, PostHogPropertyValue>;
  groupProperties?: Record<string, Record<string, PostHogPropertyValue>>;
  onlyEvaluateLocally?: boolean;
  sendFeatureFlagEvents?: boolean;
  disableGeoip?: boolean;
}

/**
 * The result of `getFeatureFlagResult` of `posthog-node`.
 */
export interface PostHogFlagResult {
  key: string;
  enabled: boolean;
  variant: string | undefined;
  payload: unknown;
  /** Only in `posthog-node` 6, e.g. `flag_disabled`. */
  reasonCode?: string;
}

/**
 * The methods of a PostHog client of `posthog-node` which the provider uses.
 * A `PostHog` instance of `posthog-node` 5 or 6 fits.
 */
export interface PostHogClient {
  getFeatureFlagResult(
    key: string,
    distinctId: string,
    options?: PostHogEvaluationOptions,
  ): Promise<PostHogFlagResult | undefined>;
  capture(message: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
    groups?: Record<string, string>;
  }): void;
  shutdown(shutdownTimeoutMs?: number): Promise<void>;
}

export interface PostHogProviderOptions {
  /**
   * Evaluate flags only with the flag definitions of local evaluation. The
   * client does not send a request to PostHog for a flag which it cannot
   * evaluate locally, and the flag resolves to its default value.
   */
  onlyEvaluateLocally?: boolean;
  /**
   * Send a `$feature_flag_called` event for each evaluation. The default of
   * `posthog-node` is `true`.
   */
  sendFeatureFlagEvents?: boolean;
  /**
   * Do not use the IP address of the server for GeoIP properties. Without
   * this option, the option of the client applies.
   */
  disableGeoip?: boolean;
  /**
   * Shut down the PostHog client when OpenFeature closes the provider.
   * Defaults to `false`, because the application created the client and can
   * use it for other things.
   */
  shutdownOnClose?: boolean;
}

/**
 * The fields of the evaluation context which the provider reads itself. It
 * gives all other primitive attributes to PostHog as person properties.
 */
const RESERVED_KEYS = new Set([
  'targetingKey',
  'distinctId',
  'groups',
  'personProperties',
  'groupProperties',
]);

interface Identity {
  distinctId: string;
  groups?: Record<string, string>;
  personProperties?: Record<string, PostHogPropertyValue>;
  groupProperties?: Record<string, Record<string, PostHogPropertyValue>>;
}

function isRecord(
  value: EvaluationContextValue | undefined,
): value is Record<string, EvaluationContextValue> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function isPropertyValue(value: unknown): value is PostHogPropertyValue {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * Copies the primitive values of an object. It drops other values, because
 * PostHog compares properties with primitive values.
 */
function toProperties(
  value: Record<string, EvaluationContextValue>,
): Record<string, PostHogPropertyValue> {
  const properties: Record<string, PostHogPropertyValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isPropertyValue(entry)) {
      properties[key] = entry;
    }
  }
  return properties;
}

function toGroups(
  value: EvaluationContextValue | undefined,
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const groups: Record<string, string> = {};
  for (const [groupType, groupKey] of Object.entries(value)) {
    if (typeof groupKey === 'string' || typeof groupKey === 'number') {
      groups[groupType] = String(groupKey);
    }
  }
  return groups;
}

function toGroupProperties(
  value: EvaluationContextValue | undefined,
): Record<string, Record<string, PostHogPropertyValue>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const groupProperties: Record<
    string,
    Record<string, PostHogPropertyValue>
  > = {};
  for (const [groupType, properties] of Object.entries(value)) {
    if (isRecord(properties)) {
      groupProperties[groupType] = toProperties(properties);
    }
  }
  return groupProperties;
}

function getDistinctId(context: EvaluationContext): string | undefined {
  if (typeof context.targetingKey === 'string' && context.targetingKey !== '') {
    return context.targetingKey;
  }
  // The v4 adapter of the Flags SDK used `distinctId` in its entities
  const { distinctId } = context;
  if (typeof distinctId === 'string' && distinctId !== '') {
    return distinctId;
  }
  return undefined;
}

/**
 * Converts the evaluation context to the arguments of PostHog. Returns
 * `undefined` if the context has no distinct ID.
 */
function toIdentity(context: EvaluationContext): Identity | undefined {
  const distinctId = getDistinctId(context);
  if (distinctId === undefined) {
    return undefined;
  }

  const personProperties: Record<string, PostHogPropertyValue> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!RESERVED_KEYS.has(key) && isPropertyValue(value)) {
      personProperties[key] = value;
    }
  }
  // The explicit person properties win over the top-level attributes
  if (isRecord(context.personProperties)) {
    Object.assign(personProperties, toProperties(context.personProperties));
  }

  const identity: Identity = { distinctId };
  const groups = toGroups(context.groups);
  if (groups !== undefined) {
    identity.groups = groups;
  }
  if (Object.keys(personProperties).length > 0) {
    identity.personProperties = personProperties;
  }
  const groupProperties = toGroupProperties(context.groupProperties);
  if (groupProperties !== undefined) {
    identity.groupProperties = groupProperties;
  }
  return identity;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || isPropertyValue(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === 'object') {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

function reasonOf(result: PostHogFlagResult): ResolutionReason {
  if (result.reasonCode === 'flag_disabled') {
    return StandardResolutionReasons.DISABLED;
  }
  if (result.enabled) {
    return StandardResolutionReasons.TARGETING_MATCH;
  }
  return StandardResolutionReasons.DEFAULT;
}

/**
 * The reason if the provider returns the default value without an error.
 */
function defaultReasonOf(result: PostHogFlagResult): ResolutionReason {
  if (result.reasonCode === 'flag_disabled') {
    return StandardResolutionReasons.DISABLED;
  }
  return StandardResolutionReasons.DEFAULT;
}

function errorDetails<T>(
  value: T,
  errorCode: ErrorCode,
  errorMessage: string,
): ResolutionDetails<T> {
  return {
    value,
    reason: StandardResolutionReasons.ERROR,
    errorCode,
    errorMessage,
  };
}

/**
 * Reads a value from the result of PostHog. Returns the value, or a message
 * if the result does not fit the type of the flag.
 */
type Read<T> = (
  result: PostHogFlagResult,
) => { value: T } | { mismatch: string } | undefined;

/**
 * An OpenFeature server provider for PostHog.
 *
 * - boolean: whether the flag is enabled for the user.
 * - string: the variant key of a multivariate flag. A boolean flag which is
 *   enabled resolves with the error `TYPE_MISMATCH`.
 * - number: the JSON payload of the flag, which must be a number.
 * - object: the JSON payload of the flag, any JSON value.
 *
 * The `targetingKey` of the evaluation context is the distinct ID. The
 * fields `groups`, `personProperties` and `groupProperties` go to PostHog
 * with the same names. Other primitive attributes are person properties.
 */
export class PostHogProvider implements Provider {
  readonly metadata: ProviderMetadata = { name: 'posthog' } as const;
  readonly runsOn = 'server';

  readonly client: PostHogClient;
  private readonly options: PostHogProviderOptions;

  constructor(client: PostHogClient, options: PostHogProviderOptions = {}) {
    this.client = client;
    this.options = options;
  }

  async onClose(): Promise<void> {
    if (this.options.shutdownOnClose) {
      await this.client.shutdown();
    }
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.resolve<boolean>(flagKey, defaultValue, context, (result) => ({
      value: result.enabled,
    }));
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.resolve<string>(flagKey, defaultValue, context, (result) => {
      if (typeof result.variant === 'string') {
        return { value: result.variant };
      }
      if (result.enabled) {
        return {
          mismatch: `Flag "${flagKey}" is a boolean flag without variants. Use a boolean flag, or an object flag to read its payload.`,
        };
      }
      // A flag which is off has no variant, so the default applies
      return undefined;
    });
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.resolve<number>(flagKey, defaultValue, context, (result) => {
      if (result.payload === undefined) {
        return undefined;
      }
      if (typeof result.payload !== 'number') {
        return {
          mismatch: `The payload of flag "${flagKey}" is not a number.`,
        };
      }
      return { value: result.payload };
    });
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    return this.resolve<T>(flagKey, defaultValue, context, (result) => {
      if (result.payload === undefined) {
        return undefined;
      }
      if (!isJsonValue(result.payload)) {
        return {
          mismatch: `The payload of flag "${flagKey}" is not a JSON value.`,
        };
      }
      return { value: result.payload as T };
    });
  }

  /**
   * Sends an event to PostHog with `capture`. The value and the other fields
   * of the details are the properties of the event.
   */
  track(
    trackingEventName: string,
    context: EvaluationContext,
    trackingEventDetails: TrackingEventDetails,
  ): void {
    const identity = toIdentity(context);
    if (identity === undefined) {
      throw new TargetingKeyMissingError(
        'PostHog needs a targetingKey (distinct ID) to track an event.',
      );
    }
    const message: Parameters<PostHogClient['capture']>[0] = {
      distinctId: identity.distinctId,
      event: trackingEventName,
      properties: { ...trackingEventDetails },
    };
    if (identity.groups !== undefined) {
      message.groups = identity.groups;
    }
    this.client.capture(message);
  }

  private async resolve<T>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    read: Read<T>,
  ): Promise<ResolutionDetails<T>> {
    const identity = toIdentity(context);
    if (identity === undefined) {
      return errorDetails(
        defaultValue,
        ErrorCode.TARGETING_KEY_MISSING,
        'PostHog needs a targetingKey (distinct ID) to evaluate a flag.',
      );
    }

    const { distinctId, ...identityOptions } = identity;
    const options: PostHogEvaluationOptions = identityOptions;
    if (this.options.onlyEvaluateLocally !== undefined) {
      options.onlyEvaluateLocally = this.options.onlyEvaluateLocally;
    }
    if (this.options.sendFeatureFlagEvents !== undefined) {
      options.sendFeatureFlagEvents = this.options.sendFeatureFlagEvents;
    }
    if (this.options.disableGeoip !== undefined) {
      options.disableGeoip = this.options.disableGeoip;
    }

    let result: PostHogFlagResult | undefined;
    try {
      result = await this.client.getFeatureFlagResult(
        flagKey,
        distinctId,
        options,
      );
    } catch (error) {
      return errorDetails(
        defaultValue,
        ErrorCode.GENERAL,
        error instanceof Error ? error.message : String(error),
      );
    }

    // PostHog returns no result for a flag which does not exist, which is
    // not active, or which it could not evaluate
    if (result === undefined) {
      return errorDetails(
        defaultValue,
        ErrorCode.FLAG_NOT_FOUND,
        `PostHog returned no result for flag "${flagKey}".`,
      );
    }

    const outcome = read(result);
    if (outcome !== undefined && 'mismatch' in outcome) {
      return errorDetails(
        defaultValue,
        ErrorCode.TYPE_MISMATCH,
        outcome.mismatch,
      );
    }

    let details: ResolutionDetails<T>;
    if (outcome === undefined) {
      // The flag is off, or it has no payload for this variant
      details = { value: defaultValue, reason: defaultReasonOf(result) };
    } else {
      details = { value: outcome.value, reason: reasonOf(result) };
    }
    if (result.variant !== undefined) {
      details.variant = result.variant;
    }
    return details;
  }
}

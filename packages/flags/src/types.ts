import type { JsonValue } from './overrides/types';
import type { FlagType } from './value-types';

/**
 * Headers which can be read but not modified.
 */
export type ReadonlyHeaders = Omit<Headers, 'append' | 'delete' | 'set'>;

/**
 * A cookie of a request.
 */
export interface RequestCookie {
  readonly name: string;
  readonly value: string;
}

/**
 * The cookies of a request, which can be read but not modified. The cookies
 * of Next.js have this shape.
 */
export interface ReadonlyRequestCookies {
  get(name: string): RequestCookie | undefined;
  getAll(): RequestCookie[];
  has(name: string): boolean;
}

/**
 * What a framework gives the SDK about a request. Each framework gives what
 * it can, so each property is optional. A Web `Request` has this shape.
 */
export interface FlagsRequestInit {
  /**
   * The headers of the request. If given, the framework must give the same
   * object during one request, because the SDK identifies the request by it.
   */
  readonly headers?: ReadonlyHeaders;
  /**
   * The cookies of the request. Without them, the SDK reads the `Cookie`
   * header.
   */
  readonly cookies?: ReadonlyRequestCookies;
  /**
   * The full URL of the request.
   */
  readonly url?: string | URL;
}

/**
 * The request in the standard shape of the SDK. It is the same for each
 * framework. Each step of the evaluation context chain and each extension of
 * the SDK receives it. All properties can be read, but not modified, and are
 * `undefined` when the framework can not give them.
 */
export interface FlagsRequest {
  /**
   * The headers of the request.
   */
  readonly headers: ReadonlyHeaders | undefined;
  /**
   * The cookies of the request. If the framework gives no cookies, they come
   * from the `Cookie` header.
   */
  readonly cookies: ReadonlyRequestCookies | undefined;
  /**
   * The full URL of the request.
   */
  readonly url: Readonly<URL> | undefined;
}

// The types below are structurally compatible with the OpenFeature server SDK,
// so any OpenFeature provider can be used without depending on @openfeature/*.

export type PrimitiveValue = null | boolean | string | number;

export type EvaluationContextValue =
  | PrimitiveValue
  | Date
  | { [key: string]: EvaluationContextValue }
  | EvaluationContextValue[];

export type EvaluationContext = {
  targetingKey?: string;
} & Record<string, EvaluationContextValue>;

export interface Logger {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

export type ResolutionDetails<T> = {
  value: T;
  variant?: string;
  flagMetadata?: Record<string, string | number | boolean>;
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
};

export interface ProviderMetadata {
  readonly name: string;
  readonly [key: string]: string;
}

/**
 * A value which a hook can receive. It is the flag value of OpenFeature,
 * which also includes `null`.
 */
export type HookFlagValue = boolean | string | number | JsonValue;

export type FlagMetadata = Record<string, string | number | boolean>;

/**
 * The result of an evaluation, as hooks receive it.
 */
export type EvaluationDetails<T> = {
  flagKey: string;
  flagMetadata: Readonly<FlagMetadata>;
} & ResolutionDetails<T>;

export type HookHints = Readonly<Record<string, unknown>>;

/**
 * Data which one hook keeps from one stage to the next during one
 * evaluation.
 */
export interface HookData {
  set(key: string, value: unknown): void;
  get(key: string): unknown;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
}

export interface ClientMetadata {
  readonly domain?: string;
  readonly sdk?: 'js-web' | 'js-server';
  readonly paradigm?: 'server' | 'client';
  readonly providerMetadata: ProviderMetadata;
}

export interface HookContext<T = HookFlagValue> {
  readonly flagKey: string;
  /**
   * The `defaultValue` of the flag. Without one, the placeholder which the
   * SDK gives to the provider.
   */
  readonly defaultValue: T;
  readonly flagValueType: FlagType;
  readonly context: Readonly<EvaluationContext>;
  readonly clientMetadata: ClientMetadata;
  readonly providerMetadata: ProviderMetadata;
  readonly logger: Logger;
  readonly hookData: HookData;
}

export interface BeforeHookContext<T = HookFlagValue> extends HookContext<T> {
  context: EvaluationContext;
}

/**
 * An OpenFeature hook. It runs code around evaluations, in four stages.
 */
export interface Hook {
  /**
   * Runs before the evaluation. A returned context is merged into the
   * evaluation context.
   */
  before?(
    hookContext: BeforeHookContext,
    hookHints?: HookHints,
    // biome-ignore lint/suspicious/noConfusingVoidType: the type of OpenFeature
  ): EvaluationContext | void | Promise<EvaluationContext | void>;
  /**
   * Runs after a successful evaluation.
   */
  after?(
    hookContext: Readonly<HookContext>,
    evaluationDetails: EvaluationDetails<HookFlagValue>,
    hookHints?: HookHints,
  ): void | Promise<void>;
  /**
   * Runs when the evaluation or a hook fails.
   */
  error?(
    hookContext: Readonly<HookContext>,
    error: unknown,
    hookHints?: HookHints,
  ): void | Promise<void>;
  /**
   * Runs after all other stages, also after an error.
   */
  finally?(
    hookContext: Readonly<HookContext>,
    evaluationDetails: EvaluationDetails<HookFlagValue>,
    hookHints?: HookHints,
  ): void | Promise<void>;
}

/**
 * The events of an OpenFeature server provider.
 */
export type ProviderEvent =
  | 'PROVIDER_READY'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_CONFIGURATION_CHANGED'
  | 'PROVIDER_STALE';

export type EventMetadata = Record<string, string | boolean | number>;

/**
 * What a provider gives with an event.
 */
export interface ProviderEventDetails {
  readonly message?: string;
  readonly metadata?: EventMetadata;
  readonly errorCode?: string;
  readonly flagsChanged?: string[];
}

/**
 * What a handler of `runtime.addHandler` receives.
 */
export interface EventDetails extends ProviderEventDetails {
  readonly providerName: string;
}

export type EventHandler = (details: EventDetails) => unknown;

/**
 * The event emitter of an OpenFeature provider. The event type is a string,
 * because OpenFeature declares it as an enum.
 */
export interface ProviderEventEmitter {
  addHandler(
    eventType: string,
    handler: (details?: ProviderEventDetails) => unknown,
  ): void;
  removeHandler(
    eventType: string,
    handler: (details?: ProviderEventDetails) => unknown,
  ): void;
}

export type TrackingEventValue =
  | PrimitiveValue
  | Date
  | { [key: string]: TrackingEventValue }
  | TrackingEventValue[];

/**
 * Data of a tracking event, e.g. the amount of a purchase.
 */
export type TrackingEventDetails = {
  value?: number;
} & Record<string, TrackingEventValue>;

/**
 * An OpenFeature provider. Only the method for boolean flags is required, so
 * that a simple provider can omit the others. A flag of a type which its
 * provider does not support fails.
 */
export interface Provider {
  readonly metadata: ProviderMetadata;
  initialize?(context?: EvaluationContext): Promise<void>;
  onClose?(): Promise<void>;
  /**
   * Hooks of the provider. They run around each evaluation of the provider.
   */
  readonly hooks?: readonly Hook[];
  /**
   * The events which the provider emits, e.g. when its configuration changes.
   */
  readonly events?: ProviderEventEmitter;
  /**
   * Records a tracking event, e.g. a purchase for an experiment.
   */
  track?(
    trackingEventName: string,
    context: EvaluationContext,
    trackingEventDetails: TrackingEventDetails,
  ): void;
  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>>;
  resolveStringEvaluation?(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<string>>;
  resolveNumberEvaluation?(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<number>>;
  resolveObjectEvaluation?<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<T>>;
}

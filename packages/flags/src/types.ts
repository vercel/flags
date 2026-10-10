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
}

export interface Provider {
  readonly metadata: ProviderMetadata;
  initialize?(context?: EvaluationContext): Promise<void>;
  onClose?(): Promise<void>;
  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>>;
}

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
 * The request in the shape which the SDK understands. Each framework gives
 * what it can: `headers` is required, the other properties are optional. A
 * Web `Request` has this shape.
 *
 * Extensions of the SDK, e.g. overrides, read only these properties. Use
 * `getCookies(request)` to read the cookies, also when a framework gives no
 * `cookies`.
 *
 * Framework adapters can add properties with declaration merging. Add only
 * optional properties, because other frameworks can not give them:
 *
 * ```ts
 * declare module 'flags' {
 *   interface FlagsRequest {
 *     readonly params?: Record<string, string>;
 *   }
 * }
 * ```
 */
export interface FlagsRequest {
  /**
   * The headers of the request. The SDK identifies a request by this object,
   * so the framework must give the same object during one request.
   */
  readonly headers: ReadonlyHeaders;
  /**
   * The cookies of the request. If missing, `getCookies` reads the `Cookie`
   * header.
   */
  readonly cookies?: ReadonlyRequestCookies;
  /**
   * The full URL of the request.
   */
  readonly url?: string;
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

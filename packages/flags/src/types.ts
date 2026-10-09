/**
 * Headers which can be read but not modified.
 */
export type ReadonlyHeaders = Omit<Headers, 'append' | 'delete' | 'set'>;

/**
 * The request which the runtime handles.
 */
export interface IncomingRequest {
  readonly headers: ReadonlyHeaders;
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

/**
 * Capabilities beyond the OpenFeature spec. Providers can opt in by setting
 * this symbol to a `ProviderExtension`.
 */
export const providerExtension: unique symbol = Symbol.for(
  'flags.provider-extension',
);

export interface ProviderExtension<K extends string = string> {
  /**
   * Type-only. Declares the flag keys this provider knows about, so
   * `defineFlag` can check them. Never set at runtime.
   */
  readonly types?: { readonly flagKey: K };

  /**
   * Called once per request, after the provider is initialized. Lets the
   * provider prepare work that later evaluations in the same request reuse,
   * e.g. making sure data is fresh. Evaluations of this provider in the same
   * request wait for it. Errors are logged, and do not stop the evaluations.
   */
  onInvoke?(request: IncomingRequest): Promise<void> | void;

  /**
   * Resolves several flags in a single call.
   */
  resolveBatch?(
    flags: { key: K; defaultValue?: boolean }[],
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>[]>;
}

export interface Provider {
  readonly metadata: ProviderMetadata;
  readonly [providerExtension]?: ProviderExtension;
  initialize?(context?: EvaluationContext): Promise<void>;
  onClose?(): Promise<void>;
  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>>;
}

/**
 * The flag keys a provider declares through its extension, or `string` if it
 * doesn't declare any.
 */
export type FlagKey<P extends Provider> = P extends {
  readonly [providerExtension]?: {
    readonly types?: { readonly flagKey: infer K extends string };
  };
}
  ? K
  : string;

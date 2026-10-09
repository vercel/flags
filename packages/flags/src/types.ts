/**
 * Headers which can be read but not modified.
 */
export type ReadonlyHeaders = Omit<Headers, 'append' | 'delete' | 'set'>;

/**
 * Headers in the shape of Node.js `IncomingMessage.headers`.
 */
export type NodeHeaders = Record<string, string | string[] | undefined>;

/**
 * A request of any framework: a Web `Request`, a Node.js `IncomingMessage`,
 * or any object with headers.
 */
export interface RequestLike {
  readonly headers: ReadonlyHeaders | NodeHeaders;
}

/**
 * The request which `getEvaluationContext` receives. The headers are always
 * Web `Headers`, whatever the framework.
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

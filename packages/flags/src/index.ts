export {
  type Config,
  type ConfiguredConnection,
  defineConfig,
  type Register,
} from './config';
export {
  type Connection,
  type ConnectionInput,
  type ConnectionOptions,
  type DefaultConnectionInput,
  defineConnection,
  type GetEvaluationContext,
  type Platform,
  type Project,
  type ProjectFieldsByPlatform,
} from './connection';
export { FlagEvaluationError } from './errors';
export {
  type Evaluate,
  type EvaluateContext,
  type EvaluateResults,
  evaluate,
  type FlagEvaluationContext,
  type FlagValueOfFlag,
} from './evaluate';
export {
  defineFlag,
  type EvaluationArgs,
  type EvaluationOptions,
  type Flag,
  type FlagOptions,
} from './flag';
export {
  decryptOverrides,
  encryptOverrides,
  type FlagOverrides,
  type JsonValue,
  type OverrideProject,
  type OverrideRejection,
  OverridesError,
  type OverridesOptions,
  type VercelOverridesOptions,
} from './overrides';
export { registerConnections, registerFlags } from './register';
export {
  type FlagDefinition,
  type RequestSource,
  type Runtime,
  runtime,
} from './runtime';
export type {
  EvaluationContext,
  EvaluationContextValue,
  FlagsRequest,
  FlagsRequestInit,
  Logger,
  PrimitiveValue,
  Provider,
  ProviderMetadata,
  ReadonlyHeaders,
  ReadonlyRequestCookies,
  RequestCookie,
  ResolutionDetails,
} from './types';
export type {
  FlagObjectValue,
  FlagOption,
  FlagOptionObject,
  FlagOptionsOf,
  FlagType,
  FlagValue,
  FlagValueFrom,
  FlagValueOf,
} from './value-types';

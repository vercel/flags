export {
  Controller,
  /** @deprecated Use `Controller` instead */
  Controller as FlagNetworkDataSource,
  type ControllerOptions,
  /** @deprecated Use `ControllerOptions` instead */
  type ControllerOptions as FlagNetworkDataSourceOptions,
} from './controller';
export {
  FallbackEntryNotFoundError,
  FallbackNotFoundError,
} from './errors';
export { evaluate } from './evaluate';
export type { CreateClientOptions } from './index.make';
export {
  type BundledDefinitions,
  type Datafile,
  type DatafileInput,
  type EvaluationParams,
  type EvaluationResult,
  type FlagsClient,
  type Packed,
  type PollingOptions,
  ResolutionReason as Reason,
  type StreamOptions,
} from './types';

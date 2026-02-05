export {
  FlagNetworkDataSource,
  type FlagNetworkDataSourceOptions,
} from './data-source/flag-network-data-source';
export type {
  FallbackEntryNotFoundError,
  FallbackNotFoundError,
} from './errors';
export { evaluate } from './evaluate';
export {
  type BundledDefinitions,
  type Datafile,
  type EvaluationParams,
  type EvaluationResult,
  type FlagsClient,
  type Packed,
  type PollingOptions,
  ResolutionReason as Reason,
  type StreamOptions,
} from './types';

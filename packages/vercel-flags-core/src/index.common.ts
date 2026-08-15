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
export { defaultReportExposures } from './exposure-reporting';
export type { CreateClientOptions } from './index.make';
export {
  type BundledDefinitions,
  type Datafile,
  type DatafileInput,
  type EvaluationOptions,
  type EvaluationParams,
  type EvaluationResult,
  type ExperimentAssignment,
  type Exposure,
  type FlagsClient,
  type Packed,
  type PollingOptions,
  type ReportExposures,
  ResolutionReason as Reason,
  type StreamOptions,
  type Value,
} from './types';

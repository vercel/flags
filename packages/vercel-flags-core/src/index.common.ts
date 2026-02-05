import { FlagNetworkDataSource } from './data-source/flag-network-data-source';
import { InMemoryDataSource } from './data-source/in-memory-data-source';
import { FallbackEntryNotFoundError, FallbackNotFoundError } from './errors';
import type { DataSource } from './types';

export {
  FallbackEntryNotFoundError,
  FallbackNotFoundError,
  FlagNetworkDataSource,
  InMemoryDataSource,
};
export {
  type Datafile,
  type EvaluationParams,
  type EvaluationResult,
  type FlagsClient,
  type Packed,
  ResolutionReason as Reason,
} from './types';
export type { DataSource };
export { evaluate } from './evaluate';

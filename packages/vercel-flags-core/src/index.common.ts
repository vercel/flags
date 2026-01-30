import { FlagNetworkDataSource } from './data-source/flag-network-data-source';
import { InMemoryDataSource } from './data-source/in-memory-data-source';
import type { DataSource } from './types';

export { FlagNetworkDataSource, InMemoryDataSource };
export {
  type EvaluationParams,
  type EvaluationResult,
  type FlagsClient,
  type Packed,
  ResolutionReason as Reason,
} from './types';
export type { DataSource };
export { evaluate } from './evaluate';

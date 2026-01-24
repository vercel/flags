import { createRawClient, type FlagsClient } from './client';
import { FlagNetworkDataSource } from './data-source/flag-network-data-source';
import { InMemoryDataSource } from './data-source/in-memory-data-source';
import type { DataSource } from './data-source/interface';
import { parseSdkKeyFromFlagsConnectionString } from './utils/sdk-keys';

export {
  createRawClient,
  type FlagsClient,
} from './client';
export { InMemoryDataSource, FlagNetworkDataSource };
export {
  type EvaluationParams,
  type EvaluationResult,
  type Packed,
  ResolutionReason as Reason,
} from './types';
export type { DataSource };
export { evaluate } from './evaluate';

let defaultFlagsClient: FlagsClient | null = null;

// Insights
// - data source must specify the environment & projectId as sdkKey has that info
// - "reuse" functionality relies on the data source having the data for all envs
export function createClient(sdkKey: string): FlagsClient {
  if (!sdkKey) throw new Error('flags: Missing sdkKey');

  // sdk key contains the environment
  const dataSource = new FlagNetworkDataSource({ sdkKey });
  return createRawClient({ dataSource });
}

/**
 * Internal function for testing purposes
 */
export function resetDefaultFlagsClient() {
  defaultFlagsClient = null;
}

/**
 * This function is for internal use only.
 *
 * Produces a default flags client reading from a default edge config.
 *
 * - relies on process.env.FLAGS
 * - does not use process.env.EDGE_CONFIG
 *
 * @param connectionString - usually from process.env.FLAGS
 * @returns - a flags client
 */
export function getDefaultFlagsClient(): FlagsClient {
  if (defaultFlagsClient) {
    return defaultFlagsClient;
  }

  if (!process.env.FLAGS) {
    throw new Error('flags: Missing environment variable FLAGS');
  }

  const sdkKey = parseSdkKeyFromFlagsConnectionString(process.env.FLAGS);
  if (!sdkKey) {
    throw new Error('flags: Missing sdkKey');
  }
  defaultFlagsClient = createClient(sdkKey);
  return defaultFlagsClient;
}

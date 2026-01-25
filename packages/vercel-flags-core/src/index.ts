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

let _defaultFlagsClient: FlagsClient | null = null;

// Insights
// - data source must specify the environment & projectId as sdkKey has that info
// - "reuse" functionality relies on the data source having the data for all envs
export function createClient(sdkKeyOrConnectionString: string): FlagsClient {
  if (!sdkKeyOrConnectionString) throw new Error('flags: Missing sdkKey');

  // Parse connection string if needed (e.g., "flags:edgeConfigId=...&sdkKey=vf_xxx")
  const sdkKey = parseSdkKeyFromFlagsConnectionString(sdkKeyOrConnectionString);
  if (!sdkKey) {
    throw new Error('flags: Missing sdkKey');
  }

  // sdk key contains the environment
  const dataSource = new FlagNetworkDataSource({ sdkKey });
  return createRawClient({ dataSource });
}

/**
 * Internal function for testing purposes
 */
export function resetDefaultFlagsClient() {
  _defaultFlagsClient = null;
}

function getOrCreateDefaultClient(): FlagsClient {
  if (_defaultFlagsClient) {
    return _defaultFlagsClient;
  }

  if (!process.env.FLAGS) {
    throw new Error('flags: Missing environment variable FLAGS');
  }

  const sdkKey = parseSdkKeyFromFlagsConnectionString(process.env.FLAGS);
  if (!sdkKey) {
    throw new Error('flags: Missing sdkKey');
  }
  _defaultFlagsClient = createClient(sdkKey);
  return _defaultFlagsClient;
}

/**
 * A lazily-initialized default flags client.
 *
 * - relies on process.env.FLAGS
 * - does not use process.env.EDGE_CONFIG
 */
export const flagsClient: FlagsClient = new Proxy({} as FlagsClient, {
  get(_, prop) {
    return getOrCreateDefaultClient()[prop as keyof FlagsClient];
  },
});

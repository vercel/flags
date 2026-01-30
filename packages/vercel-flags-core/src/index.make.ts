import type { createCreateRawClient } from './create-raw-client';
import { FlagNetworkDataSource } from './data-source/flag-network-data-source';
import type { FlagsClient } from './types';
import { parseSdkKeyFromFlagsConnectionString } from './utils/sdk-keys';

export function make(
  createRawClient: ReturnType<typeof createCreateRawClient>,
): {
  /**
   * A lazily-initialized default flags client.
   *
   * - relies on process.env.FLAGS
   * - does not use process.env.EDGE_CONFIG
   */
  flagsClient: FlagsClient;
  /**
   * Internal function for testing purposes
   */
  resetDefaultFlagsClient: () => void;
  /**
   * Create a flags client based on an SDK Key
   * @param sdkKeyOrConnectionString
   * @returns
   */
  createClient: (sdkKeyOrConnectionString: string) => FlagsClient;
} {
  let _defaultFlagsClient: FlagsClient | null = null;

  // Insights
  // - data source must specify the environment & projectId as sdkKey has that info
  // - "reuse" functionality relies on the data source having the data for all envs
  function createClient(sdkKeyOrConnectionString: string): FlagsClient {
    if (!sdkKeyOrConnectionString) throw new Error('flags: Missing sdkKey');

    // Parse connection string if needed (e.g., "flags:edgeConfigId=...&sdkKey=vf_xxx")
    const sdkKey = parseSdkKeyFromFlagsConnectionString(
      sdkKeyOrConnectionString,
    );
    if (!sdkKey) {
      throw new Error('flags: Missing sdkKey');
    }

    // sdk key contains the environment
    const dataSource = new FlagNetworkDataSource({ sdkKey });
    return createRawClient({ dataSource });
  }

  function resetDefaultFlagsClient() {
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

  const flagsClient: FlagsClient = new Proxy({} as FlagsClient, {
    get(_, prop) {
      return getOrCreateDefaultClient()[prop as keyof FlagsClient];
    },
  });

  return {
    flagsClient,
    resetDefaultFlagsClient,
    createClient,
  };
}

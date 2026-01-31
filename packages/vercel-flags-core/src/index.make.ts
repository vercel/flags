/**
 * Factory functions for exports of index.default.ts and index.next-js.ts
 */

import type { createCreateRawClient } from './create-raw-client';
import { FlagNetworkDataSource } from './data-source/flag-network-data-source';
import type { FlagsClient } from './types';
import { parseSdkKeyFromFlagsConnectionString } from './utils/sdk-keys';

export function make(
  createRawClient: ReturnType<typeof createCreateRawClient>,
): {
  flagsClient: FlagsClient;
  resetDefaultFlagsClient: () => void;
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
    return createRawClient({
      dataSource,
      origin: { provider: 'vercel', sdkKey },
    });
  }

  function resetDefaultFlagsClient() {
    _defaultFlagsClient = null;
  }

  const flagsClient: FlagsClient = new Proxy({} as FlagsClient, {
    get(_, prop) {
      if (!_defaultFlagsClient) {
        if (!process.env.FLAGS) {
          throw new Error('flags: Missing environment variable FLAGS');
        }

        const sdkKey = parseSdkKeyFromFlagsConnectionString(process.env.FLAGS);
        if (!sdkKey) {
          throw new Error('flags: Missing sdkKey');
        }
        _defaultFlagsClient = createClient(sdkKey);
      }
      return _defaultFlagsClient[prop as keyof FlagsClient];
    },
  });

  return {
    flagsClient,
    resetDefaultFlagsClient,
    createClient,
  };
}

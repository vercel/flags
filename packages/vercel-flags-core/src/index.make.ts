/**
 * Factory functions for exports of index.default.ts and index.next-js.ts
 */

import { Controller, type ControllerOptions } from './controller';
import type { createCreateRawClient } from './create-raw-client';
import type { FlagsClient } from './types';
import { parseSdkKeyFromFlagsConnectionString } from './utils/sdk-keys';

/**
 * Options for createClient
 */
export type CreateClientOptions = Omit<ControllerOptions, 'sdkKey'>;

export function make(
  createRawClient: ReturnType<typeof createCreateRawClient>,
): {
  flagsClient: FlagsClient;
  resetDefaultFlagsClient: () => void;
  createClient: (
    sdkKeyOrConnectionString: string,
    options?: CreateClientOptions,
  ) => FlagsClient;
} {
  let _defaultFlagsClient: FlagsClient | null = null;

  // Insights
  // - data source must specify the environment & projectId as sdkKey has that info
  // - "reuse" functionality relies on the data source having the data for all envs
  function createClient(
    sdkKeyOrConnectionString: string,
    options?: CreateClientOptions,
  ): FlagsClient {
    if (!sdkKeyOrConnectionString)
      throw new Error('@vercel/flags-core: Missing sdkKey');

    if (typeof sdkKeyOrConnectionString !== 'string')
      throw new Error(
        `@vercel/flags-core: Invalid sdkKey. Expected string, got ${typeof sdkKeyOrConnectionString}`,
      );

    // Parse connection string if needed (e.g., "flags:edgeConfigId=...&sdkKey=vf_xxx")
    const sdkKey = parseSdkKeyFromFlagsConnectionString(
      sdkKeyOrConnectionString,
    );
    if (!sdkKey) {
      throw new Error(
        '@vercel/flags-core: Missing sdkKey in connection string',
      );
    }

    // sdk key contains the environment
    const controller = new Controller({ sdkKey, ...options });
    return createRawClient({
      controller,
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
          throw new Error('@vercel/flags-core: Missing sdkKey');
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

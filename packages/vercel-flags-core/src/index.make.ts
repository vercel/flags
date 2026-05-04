/**
 * Factory functions for exports of index.default.ts and index.next-js.ts
 */

import { getVercelOidcTokenSync } from '@vercel/oidc';
import { Controller, type ControllerOptions } from './controller';
import type { createCreateRawClient } from './create-raw-client';
import type { FlagsClient } from './types';
import { parseSdkKeyFromFlagsConnectionString } from './utils/sdk-keys';

/**
 * Options for createClient
 */
export type CreateClientOptions = Omit<ControllerOptions, 'token'>;

function validateSdkKey(key: string) {
  if (typeof key !== 'string')
    throw new Error(
      `@vercel/flags-core: Invalid sdkKey. Expected string, got ${typeof key}`,
    );

  // Parse connection string if needed (e.g., "flags:edgeConfigId=...&sdkKey=vf_xxx")
  const sdkKey = parseSdkKeyFromFlagsConnectionString(key);
  if (!sdkKey) {
    throw new Error('@vercel/flags-core: Missing sdkKey in connection string');
  }

  return sdkKey;
}

export function make(
  createRawClient: ReturnType<typeof createCreateRawClient>,
): {
  flagsClient: FlagsClient;
  resetDefaultFlagsClient: () => void;
  createClient: <Entities = Record<string, unknown>>(
    sdkKeyOrConnectionString: string,
    options?: CreateClientOptions,
  ) => FlagsClient<Entities>;
} {
  let _defaultFlagsClient: FlagsClient | null = null;

  // Insights
  // - data source must specify the environment & projectId as sdkKey has that info
  // - "reuse" functionality relies on the data source having the data for all envs
  function createClient<Entities = Record<string, unknown>>(
    sdkKeyOrConnectionString?: string,
    options?: CreateClientOptions,
  ): FlagsClient<Entities> {
    let token: string | undefined;
    if (sdkKeyOrConnectionString) {
      token = validateSdkKey(sdkKeyOrConnectionString);
    } else {
      token = getVercelOidcTokenSync();
    }

    if (!token) {
      throw new Error('@vercel/flags-core: Missing sdkKey');
    }

    // sdk key contains the environment
    const controller = new Controller({ token, ...options });
    return createRawClient<Entities>({
      controller,
      origin: { provider: 'vercel', token },
    });
  }

  function resetDefaultFlagsClient() {
    _defaultFlagsClient = null;
  }

  const flagsClient: FlagsClient = new Proxy({} as FlagsClient, {
    get(_, prop) {
      if (!_defaultFlagsClient) {
        _defaultFlagsClient = createClient(process.env.FLAGS);
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

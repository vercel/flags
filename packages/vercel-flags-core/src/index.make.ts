/**
 * Factory functions for exports of index.default.ts and index.next-js.ts
 */

import { Controller, type ControllerOptions } from './controller';
import { Authentication } from './controller/auth';
import type { createCreateRawClient } from './create-raw-client';
import type { FlagsClient } from './types';

/**
 * Options for createClient
 */
export type CreateClientOptions = Omit<ControllerOptions, 'auth'>;

export function make(
  createRawClient: ReturnType<typeof createCreateRawClient>,
): {
  flagsClient: FlagsClient;
  resetDefaultFlagsClient: () => void;
  createClient: <Entities = Record<string, unknown>>(
    sdkKeyOrConnectionString?: string,
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
    const auth = new Authentication(sdkKeyOrConnectionString);

    // sdk key contains the environment
    const controller = new Controller({ auth, ...options });
    return createRawClient<Entities>({
      controller,
      origin: auth.sdkKey
        ? { provider: 'vercel', sdkKey: auth.sdkKey }
        : { provider: 'vercel' },
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

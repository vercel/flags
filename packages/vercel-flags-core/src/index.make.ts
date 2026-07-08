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

type CreateClient = {
  <Entities = Record<string, unknown>>(
    options: CreateClientOptions,
  ): FlagsClient<Entities>;
  <Entities = Record<string, unknown>>(
    sdkKeyOrConnectionString?: string,
    options?: CreateClientOptions,
  ): FlagsClient<Entities>;
};

export function make(
  createRawClient: ReturnType<typeof createCreateRawClient>,
): {
  flagsClient: FlagsClient;
  resetDefaultFlagsClient: () => void;
  createClient: CreateClient;
} {
  let _defaultFlagsClient: FlagsClient | null = null;

  // Insights
  // - data source must specify the environment & projectId as sdkKey has that info
  // - "reuse" functionality relies on the data source having the data for all envs
  function createClient<Entities = Record<string, unknown>>(
    options: CreateClientOptions,
  ): FlagsClient<Entities>;
  function createClient<Entities = Record<string, unknown>>(
    sdkKeyOrConnectionString?: string,
    options?: CreateClientOptions,
  ): FlagsClient<Entities>;
  function createClient<Entities = Record<string, unknown>>(
    sdkKeyOrConnectionStringOrOptions?: string | CreateClientOptions,
    options?: CreateClientOptions,
  ): FlagsClient<Entities> {
    const optionsOnly =
      typeof sdkKeyOrConnectionStringOrOptions === 'object' &&
      sdkKeyOrConnectionStringOrOptions !== null;
    const sdkKeyOrConnectionString = optionsOnly
      ? undefined
      : sdkKeyOrConnectionStringOrOptions;
    const createClientOptions = optionsOnly
      ? sdkKeyOrConnectionStringOrOptions
      : options;

    const auth = new Authentication(sdkKeyOrConnectionString);

    // sdk key contains the environment
    const controller = new Controller({ auth, ...createClientOptions });
    return createRawClient<Entities>({
      controller,
      origin: { provider: 'vercel', sdkKey: auth.sdkKey },
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

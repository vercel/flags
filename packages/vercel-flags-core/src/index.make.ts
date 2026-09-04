/**
 * Factory functions for exports of index.default.ts and index.next-js.ts
 */

import { Controller, type ControllerOptions } from './controller';
import { Authentication } from './controller/auth';
import type { createCreateRawClient } from './create-raw-client';
import type { experimental_ReportExposures, FlagsClient } from './types';

/**
 * Options for createClient
 */
export type CreateClientOptions<Entity = Record<string, unknown>> = Omit<
  ControllerOptions,
  'auth'
> & {
  /**
   * Reports experiment exposures produced by evaluation calls.
   *
   * @remarks This API is not supported for general use yet. Do not use it
   * unless Vercel has explicitly enabled it for you.
   */
  experimental_reportExposures?: experimental_ReportExposures<Entity>;
};

type CreateClient = {
  <Entities = Record<string, unknown>>(
    options: CreateClientOptions<Entities>,
  ): FlagsClient<Entities>;
  <Entities = Record<string, unknown>>(
    sdkKeyOrConnectionString?: string,
    options?: CreateClientOptions<Entities>,
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
    options: CreateClientOptions<Entities>,
  ): FlagsClient<Entities>;
  function createClient<Entities = Record<string, unknown>>(
    sdkKeyOrConnectionString?: string,
    options?: CreateClientOptions<Entities>,
  ): FlagsClient<Entities>;
  function createClient<Entities = Record<string, unknown>>(
    sdkKeyOrConnectionStringOrOptions?: string | CreateClientOptions<Entities>,
    options?: CreateClientOptions<Entities>,
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

    const { experimental_reportExposures, ...controllerOptions } =
      createClientOptions ?? {};
    const auth = new Authentication(sdkKeyOrConnectionString);

    // sdk key contains the environment
    const controller = new Controller({ auth, ...controllerOptions });
    return createRawClient<Entities>({
      controller,
      origin: { provider: 'vercel', sdkKey: auth.sdkKey },
      ...(experimental_reportExposures ? { experimental_reportExposures } : {}),
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

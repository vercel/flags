import type { Adapter } from 'flags';
import {
  DecisionMode,
  Flagship,
  FSSdkStatus,
  LogLevel,
} from '@flagship.io/js-sdk';
import type { IHit, NewVisitor } from '@flagship.io/js-sdk';
import { fetchInitialBucketingData } from './helpers/bucketing';
import type { AdapterConfig } from './types';

/**
 * Custom error class for Flagship-related errors
 */
class FlagshipAdapterError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FlagshipAdapterError';
  }
}

// Error and message constants
export const ERROR_FLAGSHIP_ENV_API_KEY_REQUIRED =
  'Environment variables `FLAGSHIP_ENV_ID` and `FLAGSHIP_API_KEY` are required when using default flagshipAdapter';
export const ERROR_FLAGSHIP_KEY_REQUIRED = 'Flagship key is required';
export const ERROR_EDGE_CONFIG_REQUIRED =
  'Environment variables `EDGE_CONFIG` and `EDGE_CONFIG_ITEM_KEY` are required in BUCKETING_EDGE decision mode when using default flagshipAdapter';
export const ERROR_FLAGSHIP_ENV_ID_API_KEY_REQUIRED =
  'Flagship envID and apiKey are required';

async function initFlagship({
  envId,
  apiKey,
  config,
}: {
  envId: string;
  apiKey: string;
  config?: AdapterConfig;
}) {
  if (Flagship.getStatus() === FSSdkStatus.SDK_NOT_INITIALIZED) {
    const initialConfig = {
      ...config,
      fetchNow: false,
    } as Record<string, unknown>;

    if (config?.decisionMode === DecisionMode.BUCKETING_EDGE) {
      if (!config.initialBucketing) {
        const BucketingData = await fetchInitialBucketingData(config);
        initialConfig.initialBucketing = BucketingData;
      }
    }

    await Flagship.start(envId, apiKey, initialConfig);
  }
}

/**
 * Creates a Flagship adapter for feature flag evaluation
 */
export function createFlagshipAdapter({
  envId,
  apiKey,
  config,
}: {
  envId: string;
  apiKey: string;
  config?: AdapterConfig;
}) {
  if (!envId || !apiKey) {
    throw new FlagshipAdapterError(ERROR_FLAGSHIP_ENV_ID_API_KEY_REQUIRED);
  }

  /**
   * Returns the value of the flag.
   * If the flag exists and the type of the default value matches the flag type value.
   * It can expose the flag if needed.
   * @param visitorExposed - Specifies whether to report the flag exposure. Default is true.
   * @returns The value of the flag.
   */
  function getFlag<ValueType, EntitiesType>(
    visitorExposed = true,
  ): Adapter<ValueType, EntitiesType> {
    return {
      origin() {
        return `https://app.flagship.io/env/${envId}/dashboard`;
      },
      async decide({ key, entities, defaultValue }): Promise<ValueType> {
        if (typeof key !== 'string' || !key) {
          throw new Error(ERROR_FLAGSHIP_KEY_REQUIRED);
        }
        await initFlagship({ envId, apiKey, config });

        const visitor = Flagship.newVisitor((entities || {}) as NewVisitor);

        await visitor.fetchFlags();
        const flag = visitor.getFlag(key);
        return flag.getValue(defaultValue, visitorExposed) as ValueType;
      },
    };
  }

  /**
   * When called, it will batch and send all hits that are in the pool before the application is closed
   */
  function close() {
    return Flagship.close();
  }

  /**
   * Returns a collection of all flags fetched for the visitor.
   * @param entities - The entities to be used for fetching flags
   * @returns — An IFSFlagCollection object.
   */
  async function getAllFlags(entities: NewVisitor) {
    await initFlagship({ envId, apiKey, config });
    const visitor = Flagship.newVisitor(entities);

    await visitor.fetchFlags();

    return visitor.getFlags();
  }

  /**
   * Sends Hits to Flagship servers for reporting.
   * @param entities - The entities to be used for the visitor.
   * @param hits - An array of HitAbstract objects to send.
   * @returns A promise that resolves when the hits are sent.
   */
  async function sendHits(entities: NewVisitor, hits: IHit[]) {
    await initFlagship({ envId, apiKey, config });
    const visitor = Flagship.newVisitor(entities);
    return visitor.sendHits(hits);
  }

  return { getFlag, getAllFlags, close, sendHits };
}

function getDecisionMode(): DecisionMode {
  const decisionModeInt = process.env.FLAGSHIP_DECISION_MODE ?? '0'; // Default DecisionMode to DECISION_API

  switch (decisionModeInt) {
    case '1':
      return DecisionMode.BUCKETING;
    case '2':
      return DecisionMode.BUCKETING_EDGE;
    default:
      return DecisionMode.DECISION_API;
  }
}

function getLogLevelFromEnv(): LogLevel {
  const value = process.env.FLAGSHIP_LOG_LEVEL;
  if (!value) {
    return LogLevel.INFO;
  }

  const parsed = parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 0 || parsed > 9) return LogLevel.INFO;

  return parsed;
}

function buildConfigFromEnv(): AdapterConfig | undefined {
  const connectionString = process.env.EDGE_CONFIG;
  const edgeConfigItemKey = process.env.EDGE_CONFIG_ITEM_KEY;

  const decisionMode = getDecisionMode();

  if (
    decisionMode === DecisionMode.BUCKETING_EDGE &&
    (!connectionString || !edgeConfigItemKey)
  ) {
    throw new FlagshipAdapterError(ERROR_EDGE_CONFIG_REQUIRED);
  }

  return {
    logLevel: getLogLevelFromEnv(),
    connectionString,
    edgeConfigItemKey,
    decisionMode,
  } as AdapterConfig;
}

function defaultFsAdapter(): ReturnType<typeof createFlagshipAdapter> {
  const envId = process.env.FLAGSHIP_ENV_ID;
  const apiKey = process.env.FLAGSHIP_API_KEY;
  if (!envId || !apiKey) {
    throw new FlagshipAdapterError(ERROR_FLAGSHIP_ENV_API_KEY_REQUIRED);
  }

  const config = buildConfigFromEnv();

  return createFlagshipAdapter({
    envId,
    apiKey,
    config,
  });
}

let adapterInstance: ReturnType<typeof createFlagshipAdapter> | null = null;

/**
 * Gets or creates the adapter instance
 * @returns The flagship adapter instance
 */
function getAdapterInstance(): ReturnType<typeof createFlagshipAdapter> {
  if (!adapterInstance) {
    adapterInstance = defaultFsAdapter();
  }
  return adapterInstance;
}

export const flagshipAdapter = {
  getFlag<ValueType, EntitiesType>(visitorExposed = true) {
    return getAdapterInstance().getFlag<ValueType, EntitiesType>(
      visitorExposed,
    );
  },
  getAllFlags: (entities: NewVisitor) =>
    getAdapterInstance().getAllFlags(entities),
  close: () => getAdapterInstance().close(),
  sendHits: (entities: NewVisitor, hits: IHit[]) =>
    getAdapterInstance().sendHits(entities, hits),
};

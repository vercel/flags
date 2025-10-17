import type { EdgeConfigClient } from '@vercel/edge-config';
import { evaluate } from './evaluate';
import { internalReportValue } from './lib/report-value';
import { store } from './store';
import {
  type ConnectionOptions,
  type EvaluationResult,
  type Packed,
  Reason,
  type Value,
} from './types';

export type Source = {
  orgId: string;
  orgSlug: string;
  projectId: string;
  projectSlug: string;
};

/**
 * A generic data source
 */
export interface DataSource {
  getData(): Promise<Packed.Data>;
}

/**
 * Implements the DataSource interface for Edge Config.
 */
export class EdgeConfigDataSource implements DataSource {
  connectionString?: string;
  edgeConfigClient: EdgeConfigClient;
  edgeConfigItemKey: string;
  requestCache: WeakMap<WeakKey, Promise<Packed.Data | undefined>>;

  constructor(options: {
    edgeConfigItemKey: string;
    edgeConfigClient: EdgeConfigClient;
  }) {
    this.edgeConfigClient = options.edgeConfigClient;
    this.edgeConfigItemKey = options.edgeConfigItemKey;
    this.requestCache = new WeakMap();
  }

  // This is a temporary solution to avoid reading the Edge Config for every flag,
  // and instead reading it once per request.
  private async getCachedData() {
    const cacheKey = store.getStore();
    if (cacheKey) {
      const cached = this.requestCache.get(cacheKey);
      if (cached) return cached;
    }
    const promise = this.edgeConfigClient.get<Packed.Data>(
      this.edgeConfigItemKey,
    );

    if (cacheKey) this.requestCache.set(cacheKey, promise);

    return promise;
  }

  async getData() {
    const data = await this.getCachedData();

    if (!data) {
      throw new Error(
        `No definitions found in Edge Config under key "${this.edgeConfigItemKey}"`,
      );
    }

    return data;
  }
}

export type FlagsClient = {
  environment: string;
  dataSource: DataSource;
  connectionOptions: ConnectionOptions;
  evaluate: <T = Value, E = Record<string, unknown>>(
    flagKey: string,
    defaultValue?: T,
    entities?: E,
  ) => Promise<EvaluationResult<T>>;
};

/**
 * Creates a Vercel Flags client
 *
 * @example
 *  const edgeConfigClient = createClient('');
 *  const flagsClient = createClient({
 *    dataSource: new EdgeConfigDataSource({
 *      edgeConfigItemKey: 'flags',
 *      edgeConfigClient,
 *    }),
 *    environment: 'production',
 *  });
 */
export function createClient({
  environment,
  dataSource,
  connectionOptions,
}: {
  environment: string;
  dataSource: DataSource;
  connectionOptions: ConnectionOptions;
}): FlagsClient {
  return {
    dataSource,
    environment,
    connectionOptions,
    async evaluate<T = Value, E = Record<string, unknown>>(
      flagKey: string,
      defaultValue?: T,
      entities?: E,
    ): Promise<EvaluationResult<T>> {
      const data = await dataSource.getData();

      const flagDefinition = data.definitions[flagKey] as Packed.FlagDefinition;

      if (flagDefinition === undefined) {
        return {
          value: defaultValue,
          reason: Reason.ERROR,
          errorMessage: `Definition not found for flag "${flagKey}"`,
        };
      }

      const result = evaluate<T>({
        defaultValue,
        definition: flagDefinition,
        environment: this.environment,
        entities: entities ?? {},
        segments: data.segments,
      });

      internalReportValue(flagKey, result.value, {
        originProjectId: connectionOptions.projectId,
        originProvider: 'vercel',
        reason: result.reason,
        outcomeType:
          result.reason !== Reason.ERROR ? result.outcomeType : undefined,
      });

      return result;
    },
  };
}

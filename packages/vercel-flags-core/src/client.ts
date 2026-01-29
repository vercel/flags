import type { DataSource } from './data-source/interface';
import { evaluate } from './evaluate';
import { internalReportValue } from './lib/report-value';
import {
  ErrorCode,
  type EvaluationResult,
  type Packed,
  ResolutionReason,
  type Value,
} from './types';

export type Source = {
  orgId: string;
  orgSlug: string;
  projectId: string;
  projectSlug: string;
};

export type FlagsClient = {
  /**
   * The transport layer for the datafile.
   */
  dataSource: DataSource;
  /**
   * Evaluate a feature flag
   *
   * Requires initialize() to have been called and awaited first.
   *
   * @param flagKey
   * @param defaultValue
   * @param entities
   * @returns
   */
  evaluate: <T = Value, E = Record<string, unknown>>(
    flagKey: string,
    defaultValue?: T,
    entities?: E,
  ) => Promise<EvaluationResult<T>>;
  /**
   * Retrieve the latest datafile during startup, and set up subscriptions if needed.
   */
  initialize(): void | Promise<void>;
  /**
   * Facilitates a clean shutdown process which may include flushing telemetry information, or closing remote connections.
   */
  shutdown(): void | Promise<void>;
  /**
   * Returns metadata about the data source
   */
  getMetadata(): Promise<{ projectId: string }>;
  /**
   * A check which will throw in case the fallback data is missing
   */
  ensureFallback(): Promise<void>;
};

/**
 * Creates a Vercel Flags client
 *
 * @example
 *  const flagsClient = createClient({
 *    dataSource: new NetworkDataSource('vf_xxx'),
 *  });
 */
export function createRawClient({
  dataSource,
}: {
  dataSource: DataSource;
}): FlagsClient {
  return {
    dataSource,
    initialize: async () => {
      return dataSource.initialize();
    },
    shutdown: async () => dataSource.shutdown(),
    getMetadata: async () => {
      return dataSource.getMetadata();
    },
    async ensureFallback(): Promise<void> {
      if (dataSource.ensureFallback) return dataSource.ensureFallback();
      throw new Error('flags: This data source does not support fallbacks');
    },
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
          reason: ResolutionReason.ERROR,
          errorCode: ErrorCode.FLAG_NOT_FOUND,
          errorMessage: `Definition not found for flag "${flagKey}"`,
        };
      }

      const result = evaluate<T>({
        defaultValue,
        definition: flagDefinition,
        environment: data.environment,
        entities: entities ?? {},
        segments: data.segments,
      });

      if (data.projectId) {
        internalReportValue(flagKey, result.value, {
          originProjectId: data.projectId,
          originProvider: 'vercel',
          reason: result.reason,
          outcomeType:
            result.reason !== ResolutionReason.ERROR
              ? result.outcomeType
              : undefined,
        });
      }

      return result;
    },
  };
}

// TODO should we store the context schema (entities schema) in Edge Config and validate context?
// TODO should we make evaluate return the variant ids as well?

import type { DataSource, DataSourceMetadata } from './data-source/interface';
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
  // environment: string;
  dataSource: DataSource;
  evaluate: <T = Value, E = Record<string, unknown>>(
    flagKey: string,
    defaultValue?: T,
    entities?: E,
  ) => Promise<EvaluationResult<T>>;
  initialize(): void | Promise<void>;
  shutdown(): void | Promise<void>;
  getMetadata(): Promise<{ projectId: string }>;
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
    async getMetadata(): Promise<DataSourceMetadata> {
      return dataSource.getMetadata();
    },
    initialize: () => {
      if (dataSource && typeof dataSource.initialize === 'function') {
        return dataSource.initialize();
      }
    },
    shutdown: () => {
      if (dataSource && typeof dataSource.shutdown === 'function') {
        return dataSource.shutdown();
      }
    },
    async evaluate<T = Value, E = Record<string, unknown>>(
      flagKey: string,
      defaultValue?: T,
      entities?: E,
    ): Promise<EvaluationResult<T>> {
      // TODO dataSource.getData should move into "initialize" and set up the subscription.
      //
      // From OpenFeature: "It's recommended to provide non-blocking mechanisms for flag
      // evaluation, particularly in languages or environments wherein there's a
      // single thread of execution.
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

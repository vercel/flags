// TODO should we store the context schema (entities schema) in Edge Config and validate context?
// TODO should we make evaluate return the variant ids as well?
import type { DataSource } from './data-source';
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
  environment: string;
  dataSource: DataSource;
  evaluate: <T = Value, E = Record<string, unknown>>(
    flagKey: string,
    defaultValue?: T,
    entities?: E,
  ) => Promise<EvaluationResult<T>>;
  initialize(): void | Promise<void>;
  shutdown(): void | Promise<void>;
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
}: {
  environment: string;
  dataSource: DataSource;
}): FlagsClient {
  return {
    dataSource,
    environment,
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
        environment: this.environment,
        entities: entities ?? {},
        segments: data.segments,
      });

      if (dataSource.projectId) {
        internalReportValue(flagKey, result.value, {
          originProjectId: dataSource.projectId,
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

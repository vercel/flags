import type { DataSource } from './data-source';
import { evaluate } from './evaluate';
import { internalReportValue } from './lib/report-value';
import {
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

export type FlagsClient = {
  environment: string;
  dataSource: DataSource;
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
}: {
  environment: string;
  dataSource: DataSource;
}): FlagsClient {
  return {
    dataSource,
    environment,
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

      if (dataSource.projectId) {
        internalReportValue(flagKey, result.value, {
          originProjectId: dataSource.projectId,
          originProvider: 'vercel',
          reason: result.reason,
          outcomeType:
            result.reason !== Reason.ERROR ? result.outcomeType : undefined,
        });
      }

      return result;
    },
  };
}

import { clientMap } from './client-map';
import { evaluate as evalFlag } from './evaluate';
import { internalReportValue } from './lib/report-value';
import type { EvaluationResult, Packed } from './types';
import { ErrorCode, ResolutionReason } from './types';

export async function initialize(id: number) {
  const ds = clientMap.get(id)!;
  return ds.initialize();
}

export async function shutdown(id: number) {
  const ds = clientMap.get(id)!;
  return ds.shutdown();
}

export async function getInfo(id: number) {
  const ds = clientMap.get(id)!;
  return ds.getInfo();
}

export async function ensureFallback(id: number) {
  const ds = clientMap.get(id)!;
  if (ds.ensureFallback) return ds.ensureFallback();
  throw new Error('flags: This data source does not support fallbacks');
}

export async function evaluate<T, E = Record<string, unknown>>(
  id: number,
  flagKey: string,
  defaultValue?: T,
  entities?: E,
): Promise<EvaluationResult<T>> {
  const ds = clientMap.get(id)!;
  const { data, metadata: dataSourceMetadata } = await ds.read();
  const flagDefinition = data.definitions[flagKey] as Packed.FlagDefinition;

  if (flagDefinition === undefined) {
    return {
      value: defaultValue,
      reason: ResolutionReason.ERROR,
      errorCode: ErrorCode.FLAG_NOT_FOUND,
      errorMessage: `Definition not found for flag "${flagKey}"`,
      metadata: {
        evaluationMs: 0,
        readMs: dataSourceMetadata.durationMs,
        source: dataSourceMetadata.source,
        cacheStatus: dataSourceMetadata.cacheStatus,
      },
    };
  }

  const evalStartTime = Date.now();
  const result = evalFlag<T>({
    defaultValue,
    definition: flagDefinition,
    environment: data.environment,
    entities: entities ?? {},
    segments: data.segments,
  });
  const evaluationDurationMs = Date.now() - evalStartTime;

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

  return {
    ...result,
    metadata: {
      evaluationMs: evaluationDurationMs,
      readMs: dataSourceMetadata.durationMs,
      source: dataSourceMetadata.source,
      cacheStatus: dataSourceMetadata.cacheStatus,
    },
  };
}

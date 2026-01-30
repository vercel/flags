import { evaluate as evalFlag } from './evaluate';
import { internalReportValue } from './lib/report-value';
import type { DataSource, EvaluationResult, Packed } from './types';
import { ErrorCode, ResolutionReason } from './types';

type ClientMap = Map<number, DataSource>;

export async function initialize(map: ClientMap, id: number) {
  const ds = map.get(id)!;
  return ds.initialize();
}

export async function shutdown(map: ClientMap, id: number) {
  const ds = map.get(id)!;
  return ds.shutdown();
}

export async function getMetadata(map: ClientMap, id: number) {
  const ds = map.get(id)!;
  return ds.getMetadata();
}

export async function ensureFallback(map: ClientMap, id: number) {
  const ds = map.get(id)!;
  if (ds.ensureFallback) return ds.ensureFallback();
  throw new Error('flags: This data source does not support fallbacks');
}

export async function evaluate<T, E = Record<string, unknown>>(
  map: ClientMap,
  id: number,
  flagKey: string,
  defaultValue?: T,
  entities?: E,
): Promise<EvaluationResult<T>> {
  const ds = map.get(id)!;
  const data = await ds.getData();
  const flagDefinition = data.definitions[flagKey] as Packed.FlagDefinition;

  if (flagDefinition === undefined) {
    return {
      value: defaultValue,
      reason: ResolutionReason.ERROR,
      errorCode: ErrorCode.FLAG_NOT_FOUND,
      errorMessage: `Definition not found for flag "${flagKey}"`,
    };
  }

  const result = evalFlag<T>({
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
}

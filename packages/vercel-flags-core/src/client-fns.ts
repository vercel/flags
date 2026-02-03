import { clientMap } from './client-map';
import { evaluate as evalFlag } from './evaluate';
import { internalReportValue } from './lib/report-value';
import type { BundledDefinitions, EvaluationResult, Packed } from './types';
import { ErrorCode, ResolutionReason } from './types';

export function initialize(id: number): Promise<void> {
  return clientMap.get(id)!.dataSource.initialize();
}

export function shutdown(id: number): void | Promise<void> {
  return clientMap.get(id)!.dataSource.shutdown();
}

export function getInfo(id: number) {
  return clientMap.get(id)!.dataSource.getInfo();
}

export function getDatafile(id: number) {
  return clientMap.get(id)!.dataSource.getDatafile();
}

export function getFallbackDatafile(id: number): Promise<BundledDefinitions> {
  const ds = clientMap.get(id)!.dataSource;
  if (ds.getFallbackDatafile) return ds.getFallbackDatafile();
  throw new Error('flags: This data source does not support fallbacks');
}

export async function evaluate<T, E = Record<string, unknown>>(
  id: number,
  flagKey: string,
  defaultValue?: T,
  entities?: E,
): Promise<EvaluationResult<T>> {
  const ds = clientMap.get(id)!.dataSource;
  const datafile = await ds.read();
  const flagDefinition = datafile.definitions[flagKey] as Packed.FlagDefinition;

  if (flagDefinition === undefined) {
    return {
      value: defaultValue,
      reason: ResolutionReason.ERROR,
      errorCode: ErrorCode.FLAG_NOT_FOUND,
      errorMessage: `Definition not found for flag "${flagKey}"`,
      metrics: {
        evaluationMs: 0,
        readMs: datafile.metrics.readMs,
        source: datafile.metrics.source,
        cacheStatus: datafile.metrics.cacheStatus,
        connectionState: datafile.metrics.connectionState,
      },
    };
  }

  const evalStartTime = Date.now();
  const result = evalFlag<T>({
    defaultValue,
    definition: flagDefinition,
    environment: datafile.environment,
    entities: entities ?? {},
    segments: datafile.segments,
  });
  const evaluationDurationMs = Date.now() - evalStartTime;

  if (datafile.projectId) {
    internalReportValue(flagKey, result.value, {
      originProjectId: datafile.projectId,
      originProvider: 'vercel',
      reason: result.reason,
      outcomeType:
        result.reason !== ResolutionReason.ERROR
          ? result.outcomeType
          : undefined,
    });
  }

  return Object.assign(result, {
    metrics: {
      evaluationMs: evaluationDurationMs,
      readMs: datafile.metrics.readMs,
      source: datafile.metrics.source,
      cacheStatus: datafile.metrics.cacheStatus,
      connectionState: datafile.metrics.connectionState,
    },
  });
}

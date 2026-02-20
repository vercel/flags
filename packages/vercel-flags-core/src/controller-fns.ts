import { evaluate as evalFlag } from './evaluate';
import { internalReportValue } from './lib/report-value';
import type {
  BundledDefinitions,
  ControllerInterface,
  Datafile,
  EvaluationResult,
  Packed,
} from './types';
import { ErrorCode, ResolutionReason } from './types';

export type ControllerInstance = {
  controller: ControllerInterface;
  initialized: boolean;
  initPromise: Promise<void> | null;
};

export const controllerInstanceMap = new Map<number, ControllerInstance>();

export function initialize(id: number): Promise<void> {
  return controllerInstanceMap.get(id)!.controller.initialize();
}

export function shutdown(id: number): void | Promise<void> {
  return controllerInstanceMap.get(id)!.controller.shutdown();
}

export function getDatafile(id: number) {
  return controllerInstanceMap.get(id)!.controller.getDatafile();
}

export function getFallbackDatafile(id: number): Promise<BundledDefinitions> {
  const ds = controllerInstanceMap.get(id)!.controller;
  if (ds.getFallbackDatafile) return ds.getFallbackDatafile();
  throw new Error('flags: This data source does not support fallbacks');
}

export async function evaluate<T, E = Record<string, unknown>>(
  id: number,
  flagKey: string,
  defaultValue?: T,
  entities?: E,
): Promise<EvaluationResult<T>> {
  const controller = controllerInstanceMap.get(id)!.controller;

  let datafile: Datafile;
  try {
    datafile = await controller.read();
  } catch (error) {
    // All data sources failed. Fall back to defaultValue if provided.
    if (defaultValue !== undefined) {
      return {
        value: defaultValue,
        reason: ResolutionReason.ERROR,
        errorMessage:
          error instanceof Error ? error.message : 'Failed to read datafile',
      };
    }
    throw error;
  }

  const flagDefinition = datafile.definitions[flagKey] as Packed.FlagDefinition;

  if (flagDefinition === undefined) {
    if (datafile.projectId) {
      internalReportValue(flagKey, defaultValue, {
        originProjectId: datafile.projectId,
        originProvider: 'vercel',
        reason: ResolutionReason.ERROR,
      });
    }

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
        mode: datafile.metrics.mode,
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
      mode: datafile.metrics.mode,
    },
  });
}

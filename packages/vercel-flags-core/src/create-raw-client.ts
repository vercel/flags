import { waitUntil } from '@vercel/functions';
import { dequal } from 'dequal/lite';
import type {
  bulkEvaluate,
  evaluate,
  getDatafile,
  getFallbackDatafile,
  initialize,
  shutdown,
} from './controller-fns';
import {
  type ControllerInstance,
  controllerInstanceMap,
} from './controller-fns';
import type {
  BulkEvaluateInput,
  BundledDefinitions,
  ControllerInterface,
  EvaluationResult,
  experimental_EvaluationOptions,
  experimental_Exposure,
  experimental_ReportExposures,
  FlagsClient,
  Packed,
  Value,
} from './types';

let idCount = 0;

async function performInitialize(
  instance: ControllerInstance,
  initFn: () => Promise<void>,
): Promise<void> {
  try {
    await initFn();
    instance.initialized = true;
  } catch (error) {
    // Clear so next call can retry
    instance.initPromise = null;
    throw error;
  }
}

export function createCreateRawClient(fns: {
  initialize: typeof initialize;
  shutdown: typeof shutdown;
  getFallbackDatafile: typeof getFallbackDatafile;
  evaluate: typeof evaluate;
  bulkEvaluate: typeof bulkEvaluate;
  getDatafile: typeof getDatafile;
}) {
  return function createRawClient<Entities = Record<string, unknown>>({
    controller,
    origin,
    experimental_reportExposures,
  }: {
    controller: ControllerInterface;
    origin?: { provider: string; sdkKey?: string };
    experimental_reportExposures?: experimental_ReportExposures<Entities>;
  }): FlagsClient<Entities> {
    const id = idCount++;
    controllerInstanceMap.set(id, {
      controller,
      initialized: false,
      initPromise: null,
    });

    function report(
      exposures: readonly experimental_Exposure[],
      entity: Readonly<Entities>,
    ): void {
      if (!experimental_reportExposures || exposures.length === 0) return;

      const pending = (async () => {
        try {
          await experimental_reportExposures(exposures, entity);
        } catch (error) {
          console.error(
            '@vercel/flags-core: Failed to report experiment exposures',
            error,
          );
        }
      })();

      try {
        waitUntil(pending);
      } catch {
        // waitUntil is best-effort; the reporter can still finish on its own.
      }
    }

    function getExposure<T>(
      flagKey: string,
      result: EvaluationResult<T>,
    ): experimental_Exposure | null {
      if (!result.experiment) return null;
      return {
        flagKey,
        experimentId: result.experiment.id,
        variantId: result.experiment.variantId,
        base: result.experiment.base,
        ...(result.experiment.rampId === undefined
          ? {}
          : { rampId: result.experiment.rampId }),
        ...(result.experiment.rampPercentage === undefined
          ? {}
          : { rampPercentage: result.experiment.rampPercentage }),
        assignmentReason: result.experiment.assignmentReason,
      };
    }

    const api = {
      origin,
      initialize: async () => {
        let instance = controllerInstanceMap.get(id);
        if (!instance) {
          instance = { controller, initialized: false, initPromise: null };
          controllerInstanceMap.set(id, instance);
        }

        // skip if already initialized
        if (instance.initialized) return;

        if (!instance.initPromise) {
          instance.initPromise = performInitialize(instance, () =>
            fns.initialize(id),
          );
        }

        return instance.initPromise;
      },
      shutdown: async () => {
        await fns.shutdown(id);
        controllerInstanceMap.delete(id);
      },
      getDatafile: async () => {
        const instance = controllerInstanceMap.get(id);
        if (instance?.initPromise) {
          try {
            await instance.initPromise;
          } catch {
            // Initialization failed — let getDatafile handle its own fallbacks
          }
        }
        return fns.getDatafile(id);
      },
      getFallbackDatafile: (): Promise<BundledDefinitions> => {
        return fns.getFallbackDatafile(id);
      },
      evaluate: async <T = Value, E = Entities>(
        flagKey: string,
        defaultValue?: T,
        entities?: E,
        options?: experimental_EvaluationOptions,
      ): Promise<EvaluationResult<T>> => {
        const instance = controllerInstanceMap.get(id);
        if (!instance?.initialized) {
          try {
            await api.initialize();
          } catch {
            // Initialization failed — let evaluate() handle the fallback
            // chain (last known value → datafile → bundled → defaultValue → throw)
          }
        }
        const entity = entities ?? ({} as E);
        const result = await fns.evaluate<T, E>(
          id,
          flagKey,
          defaultValue,
          entity,
        );
        if (
          experimental_reportExposures &&
          options?.experimental_exposureLogging !== false
        ) {
          const exposure = getExposure(flagKey, result);
          if (exposure) {
            report([exposure], entity as unknown as Readonly<Entities>);
          }
        }
        return result;
      },
      bulkEvaluate: async <T = Value, E = Entities>(
        flags: BulkEvaluateInput<T>[],
        entities?: E,
        options?: experimental_EvaluationOptions,
      ): Promise<Record<string, EvaluationResult<T>>> => {
        const instance = controllerInstanceMap.get(id);
        if (!instance?.initialized) {
          try {
            await api.initialize();
          } catch {
            // Initialization failed — let bulkEvaluate() handle the fallback
            // chain (last known value → datafile → bundled → defaultValue → throw)
          }
        }
        const entity = entities ?? ({} as E);
        const results = await fns.bulkEvaluate<T, E>(id, flags, entity);
        if (
          experimental_reportExposures &&
          options?.experimental_exposureLogging !== false
        ) {
          const exposures: experimental_Exposure[] = [];
          const seen = new Set<string>();
          for (const flag of flags) {
            if (seen.has(flag.key)) continue;
            seen.add(flag.key);
            const result = results[flag.key];
            if (!result) continue;
            const exposure = getExposure(flag.key, result);
            if (exposure) exposures.push(exposure);
          }
          report(exposures, entity as unknown as Readonly<Entities>);
        }
        return results;
      },
      experimental_reportOverride: async <T = Value, E = Entities>({
        key,
        value,
        entities,
      }: {
        key: string;
        value: T;
        entities?: E;
      }): Promise<void> => {
        if (!experimental_reportExposures) return;

        try {
          const instance = controllerInstanceMap.get(id);
          if (!instance?.initialized) await api.initialize();
          const datafile = await fns.getDatafile(id);
          const definition = datafile.definitions[key] as Packed.FlagDefinition;
          const experiment = definition?.experiment;
          if (!experiment) return;

          const variantIndex = definition.variants.findIndex((variant) =>
            dequal(variant, value),
          );
          const variantId =
            variantIndex < 0
              ? null
              : (definition.variantIds?.[variantIndex] ?? null);
          const entity = entities ?? ({} as E);
          report(
            [
              {
                flagKey: key,
                experimentId: experiment.id,
                variantId,
                base: experiment.base,
                rampId: experiment.rampId,
                rampPercentage: experiment.rampPercentage,
                assignmentReason: 'override',
              },
            ],
            entity as unknown as Readonly<Entities>,
          );
        } catch (error) {
          console.error(
            '@vercel/flags-core: Failed to report experiment override',
            error,
          );
        }
      },
    };
    return api;
  };
}

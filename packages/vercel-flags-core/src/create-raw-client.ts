import type {
  evaluate,
  getDatafile,
  getFallbackDatafile,
  initialize,
  shutdown,
} from './controller-fns';
import {
  type ControllerInstance,
  controllerInstanceMap,
} from './controller-instance-map';
import type {
  BundledDefinitions,
  ControllerInterface,
  EvaluationResult,
  FlagsClient,
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
  getDatafile: typeof getDatafile;
}) {
  return function createRawClient({
    controller,
    origin,
  }: {
    controller: ControllerInterface;
    origin?: { provider: string; sdkKey: string };
  }): FlagsClient {
    const id = idCount++;
    controllerInstanceMap.set(id, {
      controller,
      initialized: false,
      initPromise: null,
    });

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
      getDatafile: () => {
        return fns.getDatafile(id);
      },
      getFallbackDatafile: (): Promise<BundledDefinitions> => {
        return fns.getFallbackDatafile(id);
      },
      evaluate: async <T = Value, E = Record<string, unknown>>(
        flagKey: string,
        defaultValue?: T,
        entities?: E,
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
        return fns.evaluate<T, E>(id, flagKey, defaultValue, entities);
      },
      peek: () => {
        const instance = controllerInstanceMap.get(id);
        if (!instance) throw new Error(`Instance not found for id ${id}`);
        return instance;
      },
    };
    return api;
  };
}

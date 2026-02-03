import type {
  evaluate,
  getDatafile,
  getFallbackDatafile,
  getInfo,
  initialize,
  shutdown,
} from './client-fns';
import { clientMap } from './client-map';
import type {
  BundledDefinitions,
  DataSource,
  EvaluationResult,
  FlagsClient,
  Value,
} from './types';

let idCount = 0;

export function createCreateRawClient(fns: {
  initialize: typeof initialize;
  shutdown: typeof shutdown;
  getFallbackDatafile: typeof getFallbackDatafile;
  evaluate: typeof evaluate;
  getInfo: typeof getInfo;
  getDatafile: typeof getDatafile;
}) {
  return function createRawClient({
    dataSource,
    origin,
  }: {
    dataSource: DataSource;
    origin?: { provider: string; sdkKey: string };
  }): FlagsClient {
    const id = idCount++;
    clientMap.set(id, { dataSource, initialized: false });

    const api = {
      origin,
      initialize: async () => {
        let instance = clientMap.get(id);
        if (!instance) {
          instance = { dataSource, initialized: false };
          clientMap.set(id, instance);
        }

        // skip promise if already initialized
        if (instance.initialized) return;
        const promise = fns.initialize(id);
        await promise;
        instance.initialized = true;
        return promise;
      },
      shutdown: async () => {
        await fns.shutdown(id);
        clientMap.delete(id);
      },
      getInfo: () => fns.getInfo(id),
      getDatafile: () => fns.getDatafile(id),
      getFallbackDatafile: (): Promise<BundledDefinitions> => {
        return fns.getFallbackDatafile(id);
      },
      evaluate: async <T = Value, E = Record<string, unknown>>(
        flagKey: string,
        defaultValue?: T,
        entities?: E,
      ): Promise<EvaluationResult<T>> => {
        const instance = clientMap.get(id);
        if (!instance?.initialized) await api.initialize();
        return fns.evaluate<T, E>(id, flagKey, defaultValue, entities);
      },
    };
    return api;
  };
}

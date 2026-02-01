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
    clientMap.set(id, dataSource);

    // try to squeeze out some perf if we're already initialized
    let initialized = false;
    const api = {
      origin,
      initialize: async () => {
        if (initialized) return;
        if (!clientMap.has(id)) clientMap.set(id, dataSource);
        await fns.initialize(id);
        initialized = true;
      },
      shutdown: async () => {
        await fns.shutdown(id);
        initialized = false;
        clientMap.delete(id);
      },
      getInfo: async () => {
        return fns.getInfo(id);
      },
      getDatafile: async () => {
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
        if (!initialized) await api.initialize();
        return fns.evaluate<T, E>(id, flagKey, defaultValue, entities);
      },
    };
    return api;
  };
}

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
    return {
      origin,
      initialize: async () => {
        if (!clientMap.has(id)) clientMap.set(id, dataSource);
        return fns.initialize(id);
      },
      shutdown: async () => {
        await fns.shutdown(id);
        clientMap.delete(id);
      },
      getInfo: async () => {
        return fns.getInfo(id);
      },
      getDatafile: async () => {
        return fns.getDatafile(id);
      },
      async getFallbackDatafile(): Promise<BundledDefinitions> {
        return fns.getFallbackDatafile(id);
      },
      async evaluate<T = Value, E = Record<string, unknown>>(
        flagKey: string,
        defaultValue?: T,
        entities?: E,
      ): Promise<EvaluationResult<T>> {
        return fns.evaluate<T, E>(id, flagKey, defaultValue, entities);
      },
    };
  };
}

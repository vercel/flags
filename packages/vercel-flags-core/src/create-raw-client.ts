import type {
  ensureFallback,
  evaluate,
  getInfo,
  initialize,
  shutdown,
} from './client-fns';
import { clientMap } from './client-map';
import type { DataSource, EvaluationResult, FlagsClient, Value } from './types';

let idCount = 0;

export function createCreateRawClient(fns: {
  initialize: typeof initialize;
  shutdown: typeof shutdown;
  ensureFallback: typeof ensureFallback;
  evaluate: typeof evaluate;
  getInfo: typeof getInfo;
}) {
  return function createRawClient({
    dataSource,
  }: {
    dataSource: DataSource;
  }): FlagsClient {
    const id = idCount++;
    clientMap.set(id, dataSource);
    return {
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
      async ensureFallback(): Promise<void> {
        return fns.ensureFallback(id);
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

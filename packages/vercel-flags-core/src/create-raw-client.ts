import { clientMap } from './client-map';
import type {
  ensureFallback,
  evaluate,
  getMetadata,
  initialize,
  shutdown,
} from './raw-client';
import type { DataSource, EvaluationResult, FlagsClient, Value } from './types';

let idCount = 0;

export function createCreateRawClient(fns: {
  initialize: typeof initialize;
  shutdown: typeof shutdown;
  ensureFallback: typeof ensureFallback;
  evaluate: typeof evaluate;
  getMetadata: typeof getMetadata;
}) {
  return function createRawClient({
    dataSource,
  }: {
    dataSource: DataSource;
  }): FlagsClient {
    const id = idCount++;
    clientMap.set(id, dataSource);
    return {
      dataSource,
      initialize: async () => {
        return fns.initialize(id);
      },
      shutdown: async () => {
        await fns.shutdown(id);
      },
      getMetadata: async () => {
        return fns.getMetadata(id);
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

import type {
  ensureFallback,
  evaluate,
  getMetadata,
  initialize,
  shutdown,
} from './raw-client';
import type { DataSource, EvaluationResult, FlagsClient, Value } from './types';

let idCount = 0;
const clientMap = new Map<number, DataSource>();

export function createCreateRawClient(fns: {
  initialize: typeof initialize;
  shutdown: typeof shutdown;
  ensureFallback: typeof ensureFallback;
  evaluate: typeof evaluate;
  getMetadata: typeof getMetadata;
}) {
  /**
   * Creates a Vercel Flags client
   *
   * @example
   *  const flagsClient = createClient({
   *    dataSource: new NetworkDataSource('vf_xxx'),
   *  });
   */
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
        return fns.initialize(clientMap, id);
      },
      shutdown: async () => {
        await fns.shutdown(clientMap, id);
      },
      getMetadata: async () => {
        return fns.getMetadata(clientMap, id);
      },
      async ensureFallback(): Promise<void> {
        return fns.ensureFallback(clientMap, id);
      },
      async evaluate<T = Value, E = Record<string, unknown>>(
        flagKey: string,
        defaultValue?: T,
        entities?: E,
      ): Promise<EvaluationResult<T>> {
        return fns.evaluate<T, E>(
          clientMap,
          id,
          flagKey,
          defaultValue,
          entities,
        );
      },
    };
  };
}

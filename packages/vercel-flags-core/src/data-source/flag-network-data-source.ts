import { store } from '../store';
import type { DataSourceData, Packed } from '../types';
import type { DataSource } from './interface';

/**
 * Implements the DataSource interface for Edge Config.
 */
export class FlagNetworkDataSource implements DataSource {
  sdkKey?: string;
  requestCache: WeakMap<WeakKey, Promise<Packed.Data | undefined>>;

  constructor(options: {
    sdkKey: string;
  }) {
    this.sdkKey = options.sdkKey;
    this.requestCache = new WeakMap();

    // preload from embedded json AND set up stream,
    // and only ever read from in-memory data
  }

  // This is a temporary solution to avoid reading the Edge Config for every flag,
  // and instead reading it once per request.
  private async getCachedData(): Promise<DataSourceData | undefined> {
    throw new Error('not implemented yet');
    // const cacheKey = store.getStore();
    // if (cacheKey) {
    //   const cached = this.requestCache.get(cacheKey);
    //   if (cached) {
    //     return cached;
    //   }
    // }
    // const promise = this.edgeConfigClient.get<Packed.Data>(
    //   this.edgeConfigItemKey,
    // );
    // if (cacheKey) this.requestCache.set(cacheKey, promise);
    // return promise;
  }

  // called once per flag rather than once per request
  async getData() {
    const data = await this.getCachedData();
    if (!data) throw new Error(`No definitions found`);
    return data;
  }
}

import type { EdgeConfigClient } from '@vercel/edge-config';
import { store } from '../store';
import type { DataSourceData, Packed } from '../types';
import type { DataSource } from './interface';

/**
 * Implements the DataSource interface for Edge Config.
 */
export class EdgeConfigDataSource implements DataSource {
  connectionString?: string;
  edgeConfigClient: EdgeConfigClient;
  edgeConfigItemKey: string;
  requestCache: WeakMap<WeakKey, Promise<DataSourceData | undefined>>;
  projectId: string;
  environment: string;

  constructor(options: {
    edgeConfigItemKey: string;
    edgeConfigClient: EdgeConfigClient;
    projectId: string;
    environment: string;
  }) {
    this.edgeConfigClient = options.edgeConfigClient;
    this.edgeConfigItemKey = options.edgeConfigItemKey;
    this.requestCache = new WeakMap();
    this.projectId = options.projectId;
    this.environment = options.environment;
  }

  // This is a temporary solution to avoid reading the Edge Config for every flag,
  // and instead reading it once per request.
  private async getCachedData(): Promise<DataSourceData | undefined> {
    const cacheKey = store.getStore();
    if (cacheKey) {
      const cached = this.requestCache.get(cacheKey);
      if (cached) return cached;
    }
    const promise = this.edgeConfigClient
      .get<Packed.Data>(this.edgeConfigItemKey)
      .then<DataSourceData | undefined>((data) => {
        if (!data) return undefined;
        return {
          ...data,
          projectId: this.projectId,
          environment: this.environment,
        } satisfies DataSourceData;
      });

    if (cacheKey) this.requestCache.set(cacheKey, promise);

    return promise;
  }

  async getData() {
    const data = await this.getCachedData();

    if (!data) {
      throw new Error(
        `No definitions found in Edge Config under key "${this.edgeConfigItemKey}"`,
      );
    }

    return data;
  }
}

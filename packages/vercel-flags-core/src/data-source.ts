import type { EdgeConfigClient } from '@vercel/edge-config';
import { store } from './store';
import type { Packed } from './types';

/**
 * DataSource interface for the Vercel Flags client
 */
export interface DataSource {
  /**
   * The datafile
   */
  getData(): Promise<Packed.Data>;
  /**
   * The project for which these flags were loaded for
   */
  projectId?: string;
  /**
   * Initialize the data source by fetching the initial file or setting up polling or
   * subscriptions.
   *
   * @see https://openfeature.dev/specification/sections/providers#requirement-241
   */
  initialize?: () => Promise<void>;

  /**
   * End polling or subscriptions.
   */
  shutdown?(): void;
}

/**
 * Implements the DataSource interface for Edge Config.
 */
export class EdgeConfigDataSource implements DataSource {
  connectionString?: string;
  edgeConfigClient: EdgeConfigClient;
  edgeConfigItemKey: string;
  requestCache: WeakMap<WeakKey, Promise<Packed.Data | undefined>>;
  projectId?: string;

  constructor(options: {
    edgeConfigItemKey: string;
    edgeConfigClient: EdgeConfigClient;
    projectId?: string;
  }) {
    this.edgeConfigClient = options.edgeConfigClient;
    this.edgeConfigItemKey = options.edgeConfigItemKey;
    this.requestCache = new WeakMap();
    this.projectId = options.projectId;
  }

  // This is a temporary solution to avoid reading the Edge Config for every flag,
  // and instead reading it once per request.
  private async getCachedData() {
    const cacheKey = store.getStore();
    if (cacheKey) {
      const cached = this.requestCache.get(cacheKey);
      if (cached) return cached;
    }
    const promise = this.edgeConfigClient.get<Packed.Data>(
      this.edgeConfigItemKey,
    );

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

export class InMemoryDataSource implements DataSource {
  private data: Packed.Data;
  public projectId?: string;

  constructor(data: Packed.Data, projectId?: string) {
    this.data = data;
    this.projectId = projectId;
  }

  async getData() {
    return this.data;
  }
}

import type { DataSourceData } from '../types';

export type DataSourceMetadata = {
  projectId: string;
};

/**
 * DataSource interface for the Vercel Flags client
 */
export interface DataSource {
  /**
   * Initialize the data source by fetching the initial file or setting up polling or
   * subscriptions.
   *
   * @see https://openfeature.dev/specification/sections/providers#requirement-241
   */
  initialize: () => Promise<void>;

  /**
   * Returns the in-memory data file, which was loaded from initialize and maybe updated from streams.
   */
  getData(): Promise<DataSourceData>;

  /**
   * End polling or subscriptions. Flush any remaining data.
   */
  shutdown(): void;

  /**
   * Return metadata about the data source.
   */
  getMetadata(): Promise<DataSourceMetadata>;

  /**
   * Ensures bundled definitions exist as a fallback.
   * Throws if no bundled definitions are available.
   */
  ensureFallback?(): Promise<void>;
}

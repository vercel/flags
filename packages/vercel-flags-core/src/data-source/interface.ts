import type { DataSourceData } from '../types';

export type DataSourceMetadata = {
  projectId: string;
};

/**
 * DataSource interface for the Vercel Flags client
 */
export interface DataSource {
  /**
   * The datafile
   */
  getData(): Promise<DataSourceData>;

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

  getMetadata(): Promise<DataSourceMetadata>;

  /**
   * Ensures bundled definitions exist as a fallback.
   * Throws if no bundled definitions are available.
   */
  ensureFallback?(): Promise<void>;
}

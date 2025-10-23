import type { Packed } from '../types';

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

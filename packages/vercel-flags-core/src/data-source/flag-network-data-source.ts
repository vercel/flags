import type { BundledDefinitions } from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import type { DataSource } from './interface';

/**
 * Implements the DataSource interface for Edge Config.
 */
export class FlagNetworkDataSource implements DataSource {
  sdkKey?: string;
  bundledDefinitions: BundledDefinitions | null = null;

  constructor(options: {
    sdkKey: string;
  }) {
    this.sdkKey = options.sdkKey;

    // preload from embedded json AND set up stream,
    // and only ever read from in-memory data
    this.bundledDefinitions = readBundledDefinitions(this.sdkKey);
  }

  // called once per flag rather than once per request
  async getData() {
    const data = this.bundledDefinitions;
    if (!data) throw new Error(`No definitions found`);
    return data;
  }
}

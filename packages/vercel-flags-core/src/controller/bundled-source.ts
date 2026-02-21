import { FallbackEntryNotFoundError, FallbackNotFoundError } from '../errors';
import type {
  BundledDefinitions,
  BundledDefinitionsResult,
  DatafileInput,
} from '../types';
import type { readBundledDefinitions } from '../utils/read-bundled-definitions';

/**
 * Manages loading of bundled flag definitions.
 * Wraps readBundledDefinitions() with caching.
 */
export class BundledSource {
  private promise: Promise<BundledDefinitionsResult> | undefined;
  private options: {
    sdkKey: string;
    readBundledDefinitions: typeof readBundledDefinitions;
  };

  constructor(options: {
    sdkKey: string;
    readBundledDefinitions: typeof readBundledDefinitions;
  }) {
    this.options = options;
  }

  /**
   * Load bundled definitions.
   * Throws if bundled definitions are not available.
   */
  async load(): Promise<DatafileInput> {
    const result = await this.getResult();

    if (result.state === 'ok' && result.definitions) {
      return result.definitions;
    }

    throw new Error(
      '@vercel/flags-core: No flag definitions available. ' +
        'Bundled definitions not found.',
    );
  }

  /**
   * Get the raw BundledDefinitions (for getFallbackDatafile).
   * Throws typed errors if not available.
   */
  async getRaw(): Promise<BundledDefinitions> {
    const result = await this.getResult();

    switch (result.state) {
      case 'ok':
        return result.definitions;
      case 'missing-file':
        throw new FallbackNotFoundError();
      case 'missing-entry':
        throw new FallbackEntryNotFoundError();
      case 'unexpected-error':
        throw new Error(
          '@vercel/flags-core: Failed to read bundled definitions: ' +
            String(result.error),
        );
    }
  }

  /**
   * Check if bundled definitions loaded successfully (without throwing).
   */
  async tryLoad(): Promise<DatafileInput | undefined> {
    const result = await this.getResult();
    if (result.state === 'ok' && result.definitions) {
      return result.definitions;
    }
    return undefined;
  }

  private getResult(): Promise<BundledDefinitionsResult> {
    if (!this.promise) {
      this.promise = this.options.readBundledDefinitions(this.options.sdkKey);
    }
    return this.promise;
  }
}

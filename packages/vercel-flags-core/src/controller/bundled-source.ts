import { FallbackEntryNotFoundError, FallbackNotFoundError } from '../errors';
import type { BundledDefinitions, BundledDefinitionsResult } from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import type { TaggedData } from './tagged-data';
import { tagData } from './tagged-data';
import { TypedEmitter } from './typed-emitter';

export type BundledSourceEvents = {
  data: (data: TaggedData) => void;
};

/**
 * Manages loading of bundled flag definitions.
 * Wraps readBundledDefinitions() and emits typed events.
 */
export class BundledSource extends TypedEmitter<BundledSourceEvents> {
  private promise: Promise<BundledDefinitionsResult> | undefined;

  constructor(sdkKey: string) {
    super();
    // Eagerly start loading bundled definitions
    this.promise = readBundledDefinitions(sdkKey);
  }

  /**
   * Load bundled definitions and return as TaggedData.
   * Emits 'data' on success.
   * Throws if bundled definitions are not available.
   */
  async load(): Promise<TaggedData> {
    const result = await this.getResult();

    if (result?.state === 'ok' && result.definitions) {
      const tagged = tagData(result.definitions, 'bundled');
      this.emit('data', tagged);
      return tagged;
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

    if (!result) {
      throw new FallbackNotFoundError();
    }

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
  async tryLoad(): Promise<TaggedData | undefined> {
    const result = await this.getResult();
    if (result?.state === 'ok' && result.definitions) {
      const tagged = tagData(result.definitions, 'bundled');
      this.emit('data', tagged);
      return tagged;
    }
    return undefined;
  }

  private async getResult(): Promise<BundledDefinitionsResult | undefined> {
    if (!this.promise) return undefined;
    return this.promise;
  }
}

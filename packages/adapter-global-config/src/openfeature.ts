/**
 * An OpenFeature server provider for Global Config (formerly Edge Config).
 *
 * The flags are the entries of one item of a Global Config store, by
 * default the item `flags`:
 *
 * ```json
 * { "flags": { "summerSale": true, "banner": "Free shipping" } }
 * ```
 *
 * The provider imports only types of `@openfeature/server-sdk`, so it works
 * without that package at runtime.
 */

// Only types: TypeScript removes this import
import type {
  ErrorCode as ErrorCodeType,
  EvaluationContext,
  JsonValue,
  Provider,
  ProviderMetadata,
  ResolutionDetails,
} from '@openfeature/server-sdk';
import { createClient, type GlobalConfigClient } from '@vercel/global-config';

// The values of ErrorCode of @openfeature/server-sdk, so that the provider
// does not import them
const ErrorCode = {
  FLAG_NOT_FOUND: 'FLAG_NOT_FOUND' as ErrorCodeType.FLAG_NOT_FOUND,
  TYPE_MISMATCH: 'TYPE_MISMATCH' as ErrorCodeType.TYPE_MISMATCH,
  GENERAL: 'GENERAL' as ErrorCodeType.GENERAL,
} as const;

/**
 * The methods of a client of `@vercel/global-config` which the provider
 * uses.
 */
export type GlobalConfigReader = Pick<GlobalConfigClient, 'get'>;

export interface GlobalConfigProviderOptions {
  /**
   * The client of the store, or its connection string. The default is the
   * environment variable `GLOBAL_CONFIG`, then `EDGE_CONFIG`.
   */
  client?: GlobalConfigReader | string;
  /**
   * The item of the store which contains the flags. The default is `flags`.
   */
  itemKey?: string;
}

type FlagsItem = Record<string, JsonValue>;

export class GlobalConfigProvider implements Provider {
  readonly metadata: ProviderMetadata = { name: 'global-config' } as const;
  readonly runsOn = 'server';

  readonly #itemKey: string;
  #client: GlobalConfigReader | string | undefined;
  // One read for all flags which evaluate at the same time
  #pending: Promise<FlagsItem | undefined> | undefined;

  constructor(options: GlobalConfigProviderOptions = {}) {
    this.#client = options.client;
    this.#itemKey = options.itemKey ?? 'flags';
  }

  /**
   * Creates the client on the first evaluation, not in the constructor: a
   * tool can import the source, e.g. to write the manifest of the flags,
   * without the environment variable.
   */
  #getClient(): GlobalConfigReader {
    if (typeof this.#client === 'object') {
      return this.#client;
    }
    const connectionString =
      this.#client ?? (process.env.GLOBAL_CONFIG || process.env.EDGE_CONFIG);
    if (!connectionString) {
      throw new Error(
        '@flags-sdk/global-config: Missing the environment variable GLOBAL_CONFIG.',
      );
    }
    const client = createClient(connectionString);
    this.#client = client;
    return client;
  }

  #readItem(): Promise<FlagsItem | undefined> {
    if (!this.#pending) {
      const pending = Promise.resolve()
        .then(() => this.#getClient().get<FlagsItem>(this.#itemKey))
        .finally(() => {
          if (this.#pending === pending) {
            this.#pending = undefined;
          }
        });
      this.#pending = pending;
    }
    return this.#pending;
  }

  async #resolve<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    isType: (value: JsonValue) => boolean,
    typeName: string,
  ): Promise<ResolutionDetails<T>> {
    let item: FlagsItem | undefined;
    try {
      item = await this.#readItem();
    } catch (error) {
      return {
        value: defaultValue,
        reason: 'ERROR',
        errorCode: ErrorCode.GENERAL,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
    if (!item || typeof item !== 'object') {
      return {
        value: defaultValue,
        reason: 'ERROR',
        errorCode: ErrorCode.GENERAL,
        errorMessage: `@flags-sdk/global-config: The item "${this.#itemKey}" is not an object in Global Config.`,
      };
    }
    if (!Object.hasOwn(item, flagKey)) {
      return {
        value: defaultValue,
        reason: 'ERROR',
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `@flags-sdk/global-config: The flag "${flagKey}" is not in the item "${this.#itemKey}" of Global Config.`,
      };
    }
    const value = item[flagKey] as JsonValue;
    if (!isType(value)) {
      return {
        value: defaultValue,
        reason: 'ERROR',
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `@flags-sdk/global-config: The flag "${flagKey}" is not a ${typeName}.`,
      };
    }
    // A value of Global Config is the same for everybody
    return { value: value as T, reason: 'STATIC' };
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    _context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.#resolve(
      flagKey,
      defaultValue,
      (value) => typeof value === 'boolean',
      'boolean',
    );
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    _context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.#resolve(
      flagKey,
      defaultValue,
      (value) => typeof value === 'string',
      'string',
    );
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    _context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.#resolve(
      flagKey,
      defaultValue,
      (value) => typeof value === 'number',
      'number',
    );
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    _context: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    // Any JSON value, as the object method of OpenFeature
    return this.#resolve(flagKey, defaultValue, () => true, 'JSON value');
  }
}

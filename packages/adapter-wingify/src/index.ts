export { getProviderData, mergeWingifyExplorerData } from './provider';

import type { Adapter } from 'flags';
import {
  type IWingifyClient,
  type IWingifyContextModel,
  type IWingifyOptions,
  init,
} from 'wingify-fme-node-sdk';
import { WINGIFY_FM_ORIGIN } from './constants';

export type { IWingifyClient, IWingifyContextModel as WingifyContext };

export interface WingifyAdapterOptions<ValueType> {
  /**
   * Fallback passed to `getVariable` when `variableName` is set.
   * Used ahead of the `defaultValue` on the flag declaration.
   * Boolean evaluation returns `flag.isEnabled()` and does not read this field.
   */
  defaultValue?: ValueType;
  /**
   * When set, returns the value of this Wingify feature variable instead of
   * the boolean enabled/disabled state.
   */
  variableName?: string;
  /**
   * Wingify feature key when the flag `key` is a composite Explorer key
   * (e.g. `checkoutFlow:discount` evaluates feature `checkoutFlow`).
   */
  featureKey?: string;
}

export type WingifyAdapterResponse = {
  /**
   * Returns a Vercel Flags SDK Adapter that evaluates a Wingify FM feature flag.
   *
   * - Without `variableName`: resolves to `flag.isEnabled()` (boolean).
   * - With `variableName`: resolves to `flag.getVariable(variableName, defaultValue)`.
   */
  variation: <ValueType>(
    options?: WingifyAdapterOptions<ValueType>,
  ) => Adapter<ValueType, IWingifyContextModel>;
  /** The underlying Wingify client promise, useful for `getProviderData` in the well-known route. */
  wingifyClient: Promise<IWingifyClient>;
};

/**
 * Creates a Wingify FM adapter factory bound to a specific accountId + sdkKey.
 *
 * Use this when you need multiple Wingify accounts in one application, when
 * you prefer to pass credentials explicitly rather than via environment variables,
 * or when you need to pass additional Wingify SDK init options (e.g. `pollInterval`,
 * `batchEventData`).
 *
 * `shouldWaitForTrackingCalls` defaults to `true` because Vercel's serverless and edge runtimes can freeze or tear down
 * the execution environment right after a response is sent — an in-flight tracking
 * call that isn't awaited can get killed before it reaches Wingify's servers. Pass
 * `shouldWaitForTrackingCalls: false` explicitly to opt out.
 *
 * @example
 * ```ts
 * const adapter = createWingifyAdapter({ accountId: '12345', sdkKey: 'your-sdk-key' });
 * export const myFlag = flag<boolean>({
 *   key: 'my-flag',
 *   defaultValue: false,
 *   adapter: adapter.variation(),
 *   identify: ({ headers }) => ({ id: headers.get('x-user-id') ?? 'anonymous' }),
 * });
 * ```
 *
 * @example With additional SDK options
 * ```ts
 * const adapter = createWingifyAdapter({
 *   accountId: '12345',
 *   sdkKey: 'your-sdk-key',
 *   pollInterval: 60000,
 * });
 * ```
 */
export function createWingifyAdapter(
  options: IWingifyOptions,
): WingifyAdapterResponse {
  const wingifyClientPromise = init({
    shouldWaitForTrackingCalls: true,
    ...options,
  });
  // Stable id for adapters that share this Wingify SDK key and client.
  // `evaluate()` calls `decide` per flag until `bulkDecide` is implemented.
  const adapterId = `wingify:${options.sdkKey}`;

  function variation<ValueType>(
    options: WingifyAdapterOptions<ValueType> = {},
  ): Adapter<ValueType, IWingifyContextModel> {
    return {
      adapterId,
      origin: () => WINGIFY_FM_ORIGIN,
      async decide({ key, entities, defaultValue }): Promise<ValueType> {
        if (!entities?.id) {
          throw new Error(
            `Wingify Adapter: 'entities.id' is required to evaluate flag "${key}"`,
          );
        }
        const wingifyClient = await wingifyClientPromise;
        const wingifyFeatureKey = options.featureKey ?? key;
        const flag = await wingifyClient.getFlag(
          wingifyFeatureKey,
          entities as Record<string, any>,
        );

        if (options.variableName !== undefined) {
          const resolved = flag.getVariable(
            options.variableName,
            options.defaultValue ?? (defaultValue as ValueType),
          );
          return resolved as ValueType;
        }
        return flag.isEnabled() as unknown as ValueType;
      },
    };
  }

  return { variation, wingifyClient: wingifyClientPromise };
}

let _defaultAdapter: WingifyAdapterResponse | undefined;

function getOrCreateDefaultAdapter(): WingifyAdapterResponse {
  if (!_defaultAdapter) {
    const accountId = process.env.WINGIFY_ACCOUNT_ID;
    const sdkKey = process.env.WINGIFY_SDK_KEY;
    if (!accountId || !sdkKey) {
      throw new Error(
        'Wingify Adapter: Missing WINGIFY_ACCOUNT_ID or WINGIFY_SDK_KEY environment variable. ' +
          'Set them or use createWingifyAdapter({ accountId, sdkKey }) to pass credentials explicitly.',
      );
    }
    _defaultAdapter = createWingifyAdapter({ accountId, sdkKey });
  }
  return _defaultAdapter;
}

/**
 * The default Wingify FM adapter singleton.
 *
 * Reads `WINGIFY_ACCOUNT_ID` and `WINGIFY_SDK_KEY` from environment variables on first use.
 * This is the recommended way to use the adapter for most applications.
 *
 * @example
 * ```ts
 * // flags.ts
 * import { flag } from 'flags/next';
 * import { wingifyAdapter } from '@flags-sdk/wingify';
 *
 * export const checkoutV2 = flag<boolean>({
 *   key: 'checkout-v2',
 *   defaultValue: false,
 *   adapter: wingifyAdapter.variation(),
 *   identify: ({ headers }) => ({ id: headers.get('x-user-id') ?? 'anonymous' }),
 * });
 *
 * export const themeColor = flag<string>({
 *   key: 'theme',
 *   defaultValue: 'blue',
 *   adapter: wingifyAdapter.variation({ variableName: 'color', defaultValue: 'blue' }),
 *   identify: ({ headers }) => ({ id: headers.get('x-user-id') ?? 'anonymous' }),
 * });
 * ```
 */
export const wingifyAdapter: WingifyAdapterResponse = {
  variation: (...args) => getOrCreateDefaultAdapter().variation(...args),
  get wingifyClient() {
    return getOrCreateDefaultAdapter().wingifyClient;
  },
};

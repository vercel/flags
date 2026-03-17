import {
  type FeatureContext,
  type FeaturesWithFallbacks,
  type FeatureValue,
  type NetworkConfig,
  SupaClient,
  type SupaPlugin,
} from '@supashiphq/javascript-sdk';
import type { Adapter } from 'flags';

export type {
  FeatureContext,
  FeatureValue as SupashipFeatureValue,
  NetworkConfig,
  SupaPlugin,
};

type AdapterOptions = {
  /** Static context merged into every evaluation before request entities. */
  context?: FeatureContext;
  /** Optional origin used for toolbar links. */
  origin?: string | ((key: string) => string | undefined);
};

type AdapterResponse = {
  feature: <ValueType extends FeatureValue = FeatureValue>(
    options?: AdapterOptions,
  ) => Adapter<ValueType, FeatureContext>;
  /** The Supaship client instance used by the adapter. */
  supaClient: SupaClient<FeaturesWithFallbacks>;
};

type CreateSupashipAdapterOptions = {
  sdkKey: string;
  environment: string;
  context?: FeatureContext;
  sensitiveContextProperties?: string[];
  networkConfig?: NetworkConfig;
  plugins?: SupaPlugin[];
};

let defaultSupashipAdapter:
  | ReturnType<typeof createSupashipAdapter>
  | undefined;

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `@flags-sdk/supaship: Missing ${name} environment variable`,
    );
  }
  return value;
}

export function resetDefaultSupashipAdapter() {
  defaultSupashipAdapter = undefined;
}

export function createSupashipAdapter(
  options: CreateSupashipAdapterOptions,
): AdapterResponse {
  const adapterContext = options.context ?? {};

  const supaClient = new SupaClient({
    sdkKey: options.sdkKey,
    environment: options.environment,
    context: adapterContext,
    features: {},
    sensitiveContextProperties: options.sensitiveContextProperties,
    networkConfig: options.networkConfig,
    plugins: options.plugins,
    toolbar: false,
  });

  function feature<ValueType extends FeatureValue = FeatureValue>(
    adapterOptions: AdapterOptions = {},
  ): Adapter<ValueType, FeatureContext> {
    return {
      origin: adapterOptions.origin,
      async decide({ key, entities, defaultValue }) {
        const context = {
          ...adapterContext,
          ...(adapterOptions.context ?? {}),
          ...(entities ?? {}),
        };

        const value = (await supaClient.getFeature(key as never, {
          context,
        })) as ValueType | undefined;

        if (typeof value !== 'undefined' && value !== null) {
          return value;
        }

        if (typeof defaultValue !== 'undefined') {
          return defaultValue;
        }

        throw new Error(
          `@flags-sdk/supaship: Feature "${key}" resolved to null/undefined and no defaultValue was provided.`,
        );
      },
    };
  }

  return {
    feature,
    supaClient,
  };
}

function getOrCreateDefaultAdapter() {
  if (!defaultSupashipAdapter) {
    defaultSupashipAdapter = createSupashipAdapter({
      sdkKey: assertEnv('SUPASHIP_SDK_KEY'),
      environment: assertEnv('SUPASHIP_ENVIRONMENT'),
    });
  }

  return defaultSupashipAdapter;
}

export const supashipAdapter: AdapterResponse = {
  feature: (...args) => getOrCreateDefaultAdapter().feature(...args),
  get supaClient() {
    return getOrCreateDefaultAdapter().supaClient;
  },
};

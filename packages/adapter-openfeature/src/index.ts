import type { Adapter } from 'flags';
import type {
  Client,
  EvaluationContext,
  FlagEvaluationOptions,
  JsonValue,
} from '@openfeature/server-sdk';

type AdapterResponse<ClientType> = {
  booleanValue: <ValueType>(
    options?: FlagEvaluationOptions,
  ) => Adapter<ValueType, EvaluationContext>;
  stringValue: <ValueType>(
    options?: FlagEvaluationOptions,
  ) => Adapter<ValueType, EvaluationContext>;
  numberValue: <ValueType>(
    options?: FlagEvaluationOptions,
  ) => Adapter<ValueType, EvaluationContext>;
  objectValue: <ValueType>(
    options?: FlagEvaluationOptions,
  ) => Adapter<ValueType, EvaluationContext>;
  client: ClientType;
};

/**
 * Creates a sync OpenFeature adapter.
 * @param init Client
 * @example
 * ```
 * const openFeatureAdapter = createOpenFeatureAdapter(async () => {
 *   await OpenFeature.setProviderAndWait(
 *     new LaunchDarklyProvider("sdk-3eb98afb-a6ff-4d8c-a648-ddd35cad4140")
 *   );
 *   return OpenFeature.getClient();
 * });
 * ```
 */
export function createOpenFeatureAdapter(init: Client): AdapterResponse<Client>;

/**
 * Creates an async OpenFeature adapter.
 *
 * @param init () => Promise<Client>
 * @example
 * ```
 * OpenFeature.setProvider(someProvider);
 * const openFeatureAdapter = createOpenFeatureAdapter(OpenFeature.getClient());
 * ```
 */
export function createOpenFeatureAdapter(
  init: () => Promise<Client>,
): AdapterResponse<() => Promise<Client>>;
export function createOpenFeatureAdapter(
  init: Client | (() => Promise<Client>),
): AdapterResponse<Client | (() => Promise<Client>)> {
  let client: Client | null = typeof init === 'function' ? null : init;

  let clientPromise: Promise<Client>;
  async function initialize() {
    if (client) return client;
    if (clientPromise) return clientPromise;
    clientPromise = typeof init === 'function' ? init() : Promise.resolve(init);
    client = await clientPromise;
    return clientPromise;
  }

  function booleanValue<ValueType>(
    options?: FlagEvaluationOptions,
  ): Adapter<ValueType, EvaluationContext> {
    return {
      async decide({ key, entities, defaultValue }): Promise<ValueType> {
        await initialize();
        if (!client) return defaultValue as ValueType;
        return client.getBooleanValue(
          key,
          defaultValue as boolean,
          entities,
          options,
        ) as ValueType;
      },
    };
  }

  function stringValue<ValueType>(
    options?: FlagEvaluationOptions,
  ): Adapter<ValueType, EvaluationContext> {
    return {
      async decide({ key, entities, defaultValue }): Promise<ValueType> {
        await initialize();
        if (!client) return defaultValue as ValueType;
        return client.getStringValue(
          key,
          defaultValue as string,
          entities,
          options,
        ) as ValueType;
      },
    };
  }

  function numberValue<ValueType>(
    options?: FlagEvaluationOptions,
  ): Adapter<ValueType, EvaluationContext> {
    return {
      async decide({ key, entities, defaultValue }): Promise<ValueType> {
        await initialize();
        if (!client) return defaultValue as ValueType;
        return client.getNumberValue(
          key,
          defaultValue as number,
          entities,
          options,
        ) as ValueType;
      },
    };
  }

  function objectValue<ValueType>(
    options?: FlagEvaluationOptions,
  ): Adapter<ValueType, EvaluationContext> {
    return {
      async decide({ key, entities, defaultValue }): Promise<ValueType> {
        await initialize();
        if (!client) return defaultValue as ValueType;
        return client.getObjectValue(
          key,
          defaultValue as JsonValue,
          entities,
          options,
        ) as ValueType;
      },
    };
  }

  return {
    booleanValue,
    stringValue,
    numberValue,
    objectValue,
    client:
      typeof init === 'function'
        ? async () => {
            await initialize();
            if (!client)
              throw new Error(
                '@flags-sdk/openfeature: OpenFeature client failed to initialize',
              );
            return client;
          }
        : init,
  };
}

import type {
  Client,
  EvaluationContext,
  FlagEvaluationOptions,
  JsonValue,
} from '@openfeature/server-sdk';
import type { Adapter } from 'flags';

type AdapterResponse<ClientType> = {
  booleanValue: (
    options?: FlagEvaluationOptions,
  ) => Adapter<boolean, EvaluationContext>;
  stringValue: (
    options?: FlagEvaluationOptions,
  ) => Adapter<string, EvaluationContext>;
  numberValue: (
    options?: FlagEvaluationOptions,
  ) => Adapter<number, EvaluationContext>;
  objectValue: <ValueType>(
    options?: FlagEvaluationOptions,
  ) => Adapter<ValueType, EvaluationContext>;
  client: ClientType;
};

/**
 * Whether the provider signalled that it can never become ready, e.g. due to
 * bad credentials or invalid configuration. Retrying such an initialization is
 * pointless, so the failure is cached instead.
 *
 * @see https://openfeature.dev/specification/sections/providers#24-initialization
 */
function isFatalError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'PROVIDER_FATAL'
  );
}

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

  let clientPromise: Promise<Client> | null = null;
  function initialize(): Client | Promise<Client> {
    if (client) return client;
    if (clientPromise) return clientPromise;

    const attempt = (
      typeof init === 'function' ? init() : Promise.resolve(init)
    ).then(
      (resolvedClient) => {
        client = resolvedClient;
        return resolvedClient;
      },
      (error: unknown) => {
        // Initialization failed. Unless the provider declared the failure
        // fatal, forget the rejected promise so the next evaluation retries
        // instead of replaying this error for the rest of the process' life.
        if (clientPromise === attempt && !isFatalError(error)) {
          clientPromise = null;
        }
        throw error;
      },
    );
    clientPromise = attempt;
    return attempt;
  }

  function booleanValue(
    options?: FlagEvaluationOptions,
  ): Adapter<boolean, EvaluationContext> {
    return {
      async decide({ key, entities, defaultValue }): Promise<boolean> {
        const client = await initialize();
        if (!client) return defaultValue as boolean;
        return client.getBooleanValue(
          key,
          defaultValue as boolean,
          entities,
          options,
        );
      },
    };
  }

  function stringValue(
    options?: FlagEvaluationOptions,
  ): Adapter<string, EvaluationContext> {
    return {
      async decide({ key, entities, defaultValue }): Promise<string> {
        const client = await initialize();
        if (!client) return defaultValue as string;
        return client.getStringValue(
          key,
          defaultValue as string,
          entities,
          options,
        );
      },
    };
  }

  function numberValue(
    options?: FlagEvaluationOptions,
  ): Adapter<number, EvaluationContext> {
    return {
      async decide({ key, entities, defaultValue }): Promise<number> {
        const client = await initialize();
        if (!client) return defaultValue as number;
        return client.getNumberValue(
          key,
          defaultValue as number,
          entities,
          options,
        );
      },
    };
  }

  function objectValue<ValueType>(
    options?: FlagEvaluationOptions,
  ): Adapter<ValueType, EvaluationContext> {
    return {
      async decide({ key, entities, defaultValue }): Promise<ValueType> {
        const client = await initialize();
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
            const client = await initialize();
            if (!client)
              throw new Error(
                '@flags-sdk/openfeature: OpenFeature client failed to initialize',
              );
            return client;
          }
        : init,
  };
}

import type { Adapter } from 'flags';
import type {
  Client,
  EvaluationContext,
  FlagEvaluationOptions,
  JsonValue,
} from '@openfeature/server-sdk';

type AdapterResponse = {
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
  client: () => Promise<Client>;
};

export function createOpenFeatureAdapter(
  init: Client | (() => Promise<Client>),
): AdapterResponse {
  let client: Client | null = typeof init === 'function' ? null : init;

  async function initialize() {
    if (client) return client;
    client = await (typeof init === 'function' ? init() : init);
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
    client: async () => {
      await initialize();
      if (!client)
        throw new Error(
          '@flags-sdk/openfeature: OpenFeature client failed to initialize',
        );
      return client;
    },
  };
}

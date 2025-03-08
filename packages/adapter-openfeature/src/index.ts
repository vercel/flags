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
  /** The OpenFeature client instance used by the adapter. */
  client: Client;
};

export function createOpenFeatureAdapter(client: Client): AdapterResponse {
  function booleanValue<ValueType>(
    options?: FlagEvaluationOptions,
  ): Adapter<ValueType, EvaluationContext> {
    return {
      async decide({ key, entities, defaultValue }): Promise<ValueType> {
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
    client,
  };
}

import type { Adapter } from 'flags';

type JsonType =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: JsonType;
    }
  | Array<JsonType>;

interface PostHogEntities {
  distinctId: string;
}

type PostHogAdapter = {
  isFeatureEnabled: (options?: {
    sendFeatureFlagEvents?: boolean;
  }) => Adapter<boolean, PostHogEntities>;
  featureFlagValue: (options?: {
    sendFeatureFlagEvents?: boolean;
  }) => Adapter<string | boolean, PostHogEntities>;
  featureFlagPayload: <T>(
    getValue: (payload: JsonType) => T,
    options?: {
      sendFeatureFlagEvents?: boolean;
    },
  ) => Adapter<T, PostHogEntities>;
};

export type { Adapter, PostHogEntities, PostHogAdapter, JsonType };

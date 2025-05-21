import type { Adapter } from 'flags';
import type { PostHog } from 'posthog-node';

export type { Adapter } from 'flags';

export type JsonType =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: JsonType;
    }
  | Array<JsonType>;

export interface PostHogEntities {
  distinctId: string;
}

export type PostHogAdapter = {
  client: PostHog;
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

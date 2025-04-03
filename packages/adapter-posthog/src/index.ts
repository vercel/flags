import { PostHog } from 'posthog-node';
import type { PostHogAdapter, PostHogEntities, JsonType } from './types';

export type { PostHogEntities, JsonType };

export function createPostHogAdapter({
  postHogKey,
  postHogHost,
}: {
  postHogKey: string;
  postHogHost: string;
}): PostHogAdapter {
  const client = new PostHog(postHogKey, {
    host: postHogHost,
  });

  const result: PostHogAdapter = {
    client,
    isFeatureEnabled: (options) => {
      return {
        async decide({ key, entities, defaultValue }): Promise<boolean> {
          const parsedEntities = parseEntities(entities);
          const result =
            (await client.isFeatureEnabled(
              key,
              parsedEntities.distinctId,
              options,
            )) ?? defaultValue;
          if (result === undefined) {
            throw new Error(
              `PostHog Adapter isFeatureEnabled returned undefined for ${key} and no default value was provided.`,
            );
          }
          return result;
        },
      };
    },
    featureFlagValue: (options) => {
      return {
        async decide({ key, entities, defaultValue }) {
          const parsedEntities = parseEntities(entities);
          const flagValue = await client.getFeatureFlag(
            key,
            parsedEntities.distinctId,
            options,
          );
          if (flagValue === undefined) {
            if (typeof defaultValue !== 'undefined') {
              return defaultValue;
            }
            throw new Error(
              `PostHog Adapter featureFlagValue found undefined for ${key} and no default value was provided.`,
            );
          }
          return flagValue;
        },
      };
    },
    featureFlagPayload: (getValue, options) => {
      return {
        async decide({ key, entities, defaultValue }) {
          const parsedEntities = parseEntities(entities);
          const flagValue = await client.getFeatureFlag(
            key,
            parsedEntities.distinctId,
            {
              ...options,
              sendFeatureFlagEvents: false,
            },
          );
          const payload = await client.getFeatureFlagPayload(
            key,
            parsedEntities.distinctId,
            flagValue,
            options,
          );
          if (!payload) {
            if (typeof defaultValue !== 'undefined') {
              return defaultValue;
            }
            throw new Error(
              `PostHog Adapter featureFlagPayload found undefined for ${key} and no default value was provided.`,
            );
          }
          return getValue(payload);
        },
      };
    },
  };

  return result;
}

function parseEntities(entities?: PostHogEntities): PostHogEntities {
  if (!entities) {
    throw new Error(
      'PostHog Adapter: Missing entities, ' +
        'flag must be defined with an identify() function.',
    );
  }
  return entities;
}

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`PostHog Adapter: Missing ${name} environment variable`);
  }
  return value;
}

let defaultPostHogAdapter: ReturnType<typeof createPostHogAdapter> | undefined;
function getOrCreateDefaultAdapter() {
  if (!defaultPostHogAdapter) {
    defaultPostHogAdapter = createPostHogAdapter({
      postHogKey: assertEnv('NEXT_PUBLIC_POSTHOG_KEY'),
      postHogHost: assertEnv('NEXT_PUBLIC_POSTHOG_HOST'),
    });
  }
  return defaultPostHogAdapter;
}

export const postHogAdapter: PostHogAdapter = {
  isFeatureEnabled: (...args) =>
    getOrCreateDefaultAdapter().isFeatureEnabled(...args),
  featureFlagValue: (...args) =>
    getOrCreateDefaultAdapter().featureFlagValue(...args),
  featureFlagPayload: (...args) =>
    getOrCreateDefaultAdapter().featureFlagPayload(...args),
  get client() {
    return getOrCreateDefaultAdapter().client;
  },
};

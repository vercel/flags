import { PostHog } from 'posthog-node';
import type { PostHogAdapter, PostHogEntities, JsonType } from './types';

export { getProviderData } from './provider';
export type { PostHogEntities, JsonType };

export function createPostHogAdapter({
  postHogKey,
  postHogOptions,
}: {
  postHogKey: ConstructorParameters<typeof PostHog>[0];
  postHogOptions: ConstructorParameters<typeof PostHog>[1];
}): PostHogAdapter {
  const client = new PostHog(postHogKey, postHogOptions);

  const result: PostHogAdapter = {
    isFeatureEnabled: (options) => {
      return {
        async decide({ key, entities, defaultValue }): Promise<boolean> {
          const parsedEntities = parseEntities(entities);
          const result =
            (await client.isFeatureEnabled(
              trimKey(key),
              parsedEntities.distinctId,
              options,
            )) ?? defaultValue;
          if (result === undefined) {
            throw new Error(
              `PostHog Adapter isFeatureEnabled returned undefined for ${trimKey(key)} and no default value was provided.`,
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
            trimKey(key),
            parsedEntities.distinctId,
            options,
          );
          if (flagValue === undefined) {
            if (typeof defaultValue !== 'undefined') {
              return defaultValue;
            }
            throw new Error(
              `PostHog Adapter featureFlagValue found undefined for ${trimKey(key)} and no default value was provided.`,
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
          const payload = await client.getFeatureFlagPayload(
            trimKey(key),
            parsedEntities.distinctId,
            undefined,
            options,
          );
          if (!payload) {
            if (typeof defaultValue !== 'undefined') {
              return defaultValue;
            }
            throw new Error(
              `PostHog Adapter featureFlagPayload found undefined for ${trimKey(key)} and no default value was provided.`,
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

// Read until the first `.`
// This supports defining multiple flags with the same key
// Ex. with my-flag.is-enabled, my-flag.variant and my-flag.payload
function trimKey(key: string): string {
  return key.split('.')[0] as string;
}

let defaultPostHogAdapter: ReturnType<typeof createPostHogAdapter> | undefined;
function getOrCreateDefaultAdapter() {
  if (!defaultPostHogAdapter) {
    defaultPostHogAdapter = createPostHogAdapter({
      postHogKey: assertEnv('NEXT_PUBLIC_POSTHOG_KEY'),
      postHogOptions: {
        host: assertEnv('NEXT_PUBLIC_POSTHOG_HOST'),
        personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY,
        featureFlagsPollingInterval: 10_000,
        // Presumption: Server IP is likely not a good proxy for user location
        disableGeoip: true,
      },
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
};

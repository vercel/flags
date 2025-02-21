import { Adapter } from 'flags';
import posthog from 'posthog-js';

export function createPostHogAdapter(apiKey: string): Adapter<boolean, any> {
  posthog.init(apiKey);

  return {
    decide: async ({ key }) => {
      return posthog.isFeatureEnabled(key);
    },
  };
}

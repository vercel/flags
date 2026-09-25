import { getProviderData } from '@flags-sdk/launchdarkly';
import { createFlagsDiscoveryEndpoint } from 'flags/next';

export const GET = createFlagsDiscoveryEndpoint(() =>
  getProviderData({
    apiKey: process.env.LAUNCHDARKLY_API_KEY!,
    environment: process.env.LAUNCHDARKLY_ENVIRONMENT!,
    projectKey: process.env.LAUNCHDARKLY_PROJECT_SLUG!,
  }),
);

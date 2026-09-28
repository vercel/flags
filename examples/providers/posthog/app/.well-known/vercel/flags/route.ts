import { getProviderData } from '@flags-sdk/posthog';
import { createFlagsDiscoveryEndpoint } from 'flags/next';

export const GET = createFlagsDiscoveryEndpoint(() =>
  getProviderData({
    projectSecretApiKey: process.env.POSTHOG_PROJECT_SECRET_API_KEY!,
    projectId: process.env.POSTHOG_PROJECT_ID!,
  }),
);

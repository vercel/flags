import { getProviderData } from '@flags-sdk/flagsmith';
import { createFlagsDiscoveryEndpoint } from 'flags/next';

export const GET = createFlagsDiscoveryEndpoint(() =>
  getProviderData({
    environmentKey: process.env.FLAGSMITH_ENVIRONMENT_ID!,
    projectId: process.env.FLAGSMITH_PROJECT_ID!,
  }),
);

import { getProviderData } from '@flags-sdk/growthbook';
import { createFlagsDiscoveryEndpoint } from 'flags/next';

export const GET = createFlagsDiscoveryEndpoint(() =>
  getProviderData({
    apiKey: process.env.GROWTHBOOK_API_KEY!,
    clientKey: process.env.GROWTHBOOK_CLIENT_KEY,
    appApiHost: process.env.GROWTHBOOK_APP_API_HOST,
    appOrigin: process.env.GROWTHBOOK_APP_ORIGIN,
  }),
);

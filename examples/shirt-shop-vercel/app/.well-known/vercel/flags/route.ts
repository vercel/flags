import { getProviderData } from '@flags-sdk/vercel';
import { createFlagsDiscoveryEndpoint } from 'flags/next';
import * as flags from '../../../../flags';

export const GET = createFlagsDiscoveryEndpoint(async (request) => {
  const providerData = await getProviderData(flags);
  return providerData;
});

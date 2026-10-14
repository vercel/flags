import { createFlagsDiscoveryEndpoint, getProviderData } from 'flags/next';
import { rootFlags } from '../../../../flags';

export const GET = createFlagsDiscoveryEndpoint(async () => {
  return getProviderData({ rootFlags });
});

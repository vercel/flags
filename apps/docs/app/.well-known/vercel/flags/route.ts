import { createFlagsDiscoveryEndpoint, getProviderData } from 'flags/next';
import * as flags from '../../../flags';

export const GET = createFlagsDiscoveryEndpoint(async (request) => {
  return getProviderData(flags);
});

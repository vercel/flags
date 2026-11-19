import * as marketing from 'flags:marketing';
import * as shop from 'flags:shop';
import { createFlagsDiscoveryEndpoint, getProviderData } from 'flags/discovery';

// The Flags Discovery Endpoint for Flags Explorer. The application adds it
// by hand, with the generated modules of its sources.
export const GET = createFlagsDiscoveryEndpoint(() =>
  getProviderData(shop, marketing),
);

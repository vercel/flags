import { createFlagsDiscoveryEndpoint, getProviderData } from 'flags/discovery';
import * as flags from '../../../../flags';

// The Flags Discovery Endpoint, which Flags Explorer queries to find the
// flags. It needs FLAGS_SECRET. A Next.js plugin can not add a route, so
// the application adds this file.
export const GET = createFlagsDiscoveryEndpoint(() => getProviderData(flags));

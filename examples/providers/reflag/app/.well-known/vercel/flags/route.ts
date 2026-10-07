import { getProviderData as getReflagProviderData } from '@flags-sdk/reflag';
import { mergeProviderData } from 'flags';
import { createFlagsDiscoveryEndpoint, getProviderData } from 'flags/next';
import * as flags from '../../../../flags';

export const GET = createFlagsDiscoveryEndpoint(() =>
  mergeProviderData([getProviderData(flags), getReflagProviderData()]),
);

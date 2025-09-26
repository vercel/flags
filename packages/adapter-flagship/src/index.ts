import { createFlagshipAdapter, flagshipAdapter } from './adapter';
import type { AdapterConfig } from './types';
import { getProviderData } from './helpers/bucketing';

export * from '@flagship.io/js-sdk';

export {
  createFlagshipAdapter,
  type AdapterConfig,
  getProviderData,
  flagshipAdapter,
};

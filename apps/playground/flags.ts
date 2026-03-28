import { vercelAdapter } from '@flags-sdk/vercel';
import { flag } from 'flags/next';
import type { CheckoutExperiment } from './types';
import { identify } from './utils';

export const checkoutExperiment = flag<CheckoutExperiment>({
  key: 'free-shipping-banner',
  adapter: vercelAdapter(),
  identify,
});

export const jsonFlag = flag({
  key: 'json-flag',
  adapter: vercelAdapter(),
});

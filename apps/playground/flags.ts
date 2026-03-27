import { vercelAdapter } from '@flags-sdk/vercel';
import { dedupe, flag } from 'flags/next';
import type { CheckoutExperiment, Entity } from './types';
import { generateRandomId } from './utils';

export const identify = dedupe((): Entity => {
  return {
    visitor: {
      id: generateRandomId(),
    },
  };
});

export const checkoutExperiment = flag<CheckoutExperiment>({
  key: 'fake-hat-checkout-experiment',
  adapter: vercelAdapter(),
  identify,
});

export const jsonFlag = flag({
  key: 'json-flag',
  adapter: vercelAdapter(),
});

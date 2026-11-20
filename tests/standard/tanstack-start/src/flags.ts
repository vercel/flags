'use flags';

import { defineSource } from 'flags';

// A 'use flags' module: it exports only flags, and the plugin of @flags-sdk/tanstack-start/vite
// registers them
const shop = defineSource({
  provider: {
    metadata: { name: 'shop' },
    resolveBooleanEvaluation: async (_key, _defaultValue, context) => ({
      value: context.user === 'alice',
    }),
    resolveStringEvaluation: async () => ({ value: 'Summer sale!' }),
  },
  project: { system: 'in-memory' },
  getEvaluationContext: (request) => ({
    user: request?.cookies?.get('user')?.value ?? 'anonymous',
  }),
});

export const newCheckout = shop.bindFlag('new-checkout', {
  defaultValue: false,
});
export const bannerText = shop.bindFlag('banner-text', {
  type: 'string',
  defaultValue: 'Welcome',
  description: 'The text of the banner',
});

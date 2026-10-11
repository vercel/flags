'use flags';

import { defineConnection, defineFlag } from 'flags';

// A 'use flags' module: it exports only flags, and the plugin of @flags-sdk/tanstack-start/vite
// registers them
const shop = defineConnection({
  provider: {
    metadata: { name: 'shop' },
    resolveBooleanEvaluation: async (_key, _defaultValue, context) => ({
      value: context.user === 'alice',
    }),
    resolveStringEvaluation: async () => ({ value: 'Summer sale!' }),
  },
  project: { system: 'in-memory' },
  getEvaluationContext: (_context, request) => ({
    user: request?.cookies?.get('user')?.value ?? 'anonymous',
  }),
});

export const newCheckout = defineFlag(shop, 'new-checkout', false);
export const bannerText = defineFlag({
  key: 'banner-text',
  type: 'string',
  defaultValue: 'Welcome',
  description: 'The text of the banner',
  connection: shop,
});

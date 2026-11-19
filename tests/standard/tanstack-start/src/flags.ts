'use flags';

import { bindFlag, defineSource } from 'flags';

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
  getEvaluationContext: (_context, request) => ({
    user: request?.cookies?.get('user')?.value ?? 'anonymous',
  }),
});

export const newCheckout = bindFlag({
  key: 'new-checkout',
  source: shop,
  defaultValue: false,
});
export const bannerText = bindFlag({
  key: 'banner-text',
  type: 'string',
  defaultValue: 'Welcome',
  description: 'The text of the banner',
  source: shop,
});

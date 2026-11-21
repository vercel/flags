'use flags';

import { defineSource } from 'flags';

// A 'use flags' module: it exports only flags, and the module @flags-sdk/nuxt
// registers them
const shop = defineSource({
  provider: {
    metadata: { name: 'shop' },
    resolveBooleanEvaluation: async () => ({ value: true }),
    resolveStringEvaluation: async () => ({ value: 'Summer sale!' }),
  },
  project: { system: 'in-memory' },
});

export const summerSale = shop.bindFlag('summer-sale', {
  defaultValue: false,
});
export const bannerText = shop.bindFlag('banner-text', {
  type: 'string',
  defaultValue: 'Welcome',
  description: 'The text of the banner',
});

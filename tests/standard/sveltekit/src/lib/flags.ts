'use flags';

import { defineConnection, defineFlag } from 'flags';

// A 'use flags' module: it exports only flags, and the plugin of flags/vite
// registers them
const shop = defineConnection({
  provider: {
    metadata: { name: 'shop' },
    resolveBooleanEvaluation: async () => ({ value: true }),
    resolveStringEvaluation: async () => ({ value: 'Summer sale!' }),
  },
  project: { platform: 'in-memory' },
});

export const summerSale = defineFlag(shop, 'summer-sale', false);
export const bannerText = defineFlag({
  key: 'banner-text',
  type: 'string',
  options: ['Welcome', 'Summer sale!'],
  defaultValue: 'Welcome',
  description: 'The text of the banner',
  connection: shop,
});

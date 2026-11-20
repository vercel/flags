'use flags';

import { bindFlag, defineSource } from 'flags';

// A 'use flags' module: it exports only flags. Without a bundler, the
// script `flags manifest` imports it to write the manifest.
const shop = defineSource({
  provider: {
    metadata: { name: 'shop' },
    resolveBooleanEvaluation: async () => ({ value: true }),
    resolveStringEvaluation: async () => ({ value: 'Summer sale!' }),
  },
  project: { system: 'in-memory' },
});

export const summerSale = bindFlag({
  key: 'summer-sale',
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

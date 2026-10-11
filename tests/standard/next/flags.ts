'use flags';

import { defineFlag } from 'flags';

// A 'use flags' module: it exports only flags, and withFlags registers them.
// No connection: the flags use the default connection of flags.config.ts
export const summerSale = defineFlag({ key: 'summer-sale' });
export const newCheckout = defineFlag({ key: 'new-checkout' });
export const bannerText = defineFlag({
  key: 'banner-text',
  type: 'string',
  defaultValue: 'Welcome',
  description: 'The text of the banner',
});

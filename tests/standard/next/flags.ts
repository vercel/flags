'use flags';

import { bindFlag } from 'flags';

// A 'use flags' module: it exports only flags, and withFlags registers them.
// No source: the flags use the default source of flags.config.ts
export const summerSale = bindFlag({ key: 'summer-sale' });
export const newCheckout = bindFlag({ key: 'new-checkout' });
export const bannerText = bindFlag({
  key: 'banner-text',
  type: 'string',
  defaultValue: 'Welcome',
  description: 'The text of the banner',
});

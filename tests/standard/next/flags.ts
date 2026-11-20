'use flags';

import { self } from './flags/self';

// A 'use flags' module: it exports only flags, and withFlags registers them.
// The flags of the source of this app (flags/self.ts)
export const summerSale = self.bindFlag('summer-sale');
export const newCheckout = self.bindFlag('new-checkout');
export const bannerText = self.bindFlag('banner-text', {
  type: 'string',
  defaultValue: 'Welcome',
  description: 'The text of the banner',
});

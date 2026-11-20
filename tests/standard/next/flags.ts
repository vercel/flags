'use flags';

import { bindFlag } from 'flags';
import { self } from './flags/self';

// A 'use flags' module: it exports only flags, and withFlags registers them.
// The flags of the source of this app (flags/self.ts)
export const summerSale = bindFlag({ key: 'summer-sale', source: self });
export const newCheckout = bindFlag({ key: 'new-checkout', source: self });
export const bannerText = bindFlag({
  key: 'banner-text',
  source: self,
  type: 'string',
  defaultValue: 'Welcome',
  description: 'The text of the banner',
});

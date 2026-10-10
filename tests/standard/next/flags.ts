import { defineFlag } from 'flags';

// No connection: the flags use the default connection of flags.config.ts
export const summerSale = defineFlag({ key: 'summer-sale' });
export const newCheckout = defineFlag({ key: 'new-checkout' });
export const bannerText = defineFlag({
  key: 'banner-text',
  type: 'string',
  defaultValue: 'Welcome',
});

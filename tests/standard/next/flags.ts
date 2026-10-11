import { defineFlag } from 'flags';

// No connection: the flags use the default connection of flags.config.ts
export const summerSale = defineFlag({ key: 'summer-sale' });
export const newCheckout = defineFlag({ key: 'new-checkout' });
export const bannerText = defineFlag({
  key: 'banner-text',
  type: 'string',
  defaultValue: 'Welcome',
});

// The flags of the precomputed page. Their code is signed with the secret of
// the build, which withFlags puts into the server code.
export const precomputeFlags = [summerSale, newCheckout] as const;

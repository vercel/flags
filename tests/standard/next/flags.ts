import { defineFlag } from 'flags';

// No connection: the flags use the default connection of flags.config.ts
export const summerSale = defineFlag({ key: 'summer-sale' });
export const newCheckout = defineFlag({ key: 'new-checkout' });
export const bannerText = defineFlag({
  key: 'banner-text',
  type: 'string',
  defaultValue: 'Welcome',
});

// The flags of the precomputed page, and the secret which signs their code.
// An application usually uses FLAGS_SECRET. An explicit secret keeps the
// platform variant without FLAGS_SECRET.
export const precomputeFlags = [summerSale, newCheckout] as const;
export const PRECOMPUTE_SECRET = 'cHJlY29tcHV0ZS10ZXN0LXNlY3JldC1mb3ItZmxhZ3M';

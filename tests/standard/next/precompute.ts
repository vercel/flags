import { newCheckout, summerSale } from './flags';

// The flags of the precomputed page. Their code is signed with the secret of
// the build, which withFlags puts into the server code. Not in flags.ts,
// because a 'use flags' module exports only flags.
export const precomputeFlags = [summerSale, newCheckout] as const;

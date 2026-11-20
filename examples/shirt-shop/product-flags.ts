import {
  proceedToCheckoutColorFlag,
  showFreeDeliveryBannerFlag,
  showSummerBannerFlag,
} from './flags';

// The flags which the proxy precomputes for the pages of app/[code]. Not in
// flags.ts, because a 'use flags' module exports only flags.
export const productFlags = [
  showFreeDeliveryBannerFlag,
  showSummerBannerFlag,
  proceedToCheckoutColorFlag,
] as const;

'use flags';

import { defineFlag, type FlagsRequest } from 'flags';
import { xxHash32 } from 'js-xxhash';

/**
 * The evaluation context which the proxy gives to the flags. On the first
 * request the stable id is not in the cookie yet, so the proxy passes the
 * generated id here.
 */
type EvaluationContext = { stableId?: string } | undefined;

/**
 * Takes a string and puts it into a bucket.
 *
 * Typically the key consists of the experiment name and the stableId, such that
 * every experiment has a different outcome. If it would depend on the stableId only,
 * then a user would consistently get assigned the same bucket for all experiments,
 * which we need to avoid.
 *
 * @param key - The key to hash.
 * @param buckets - The number of buckets to use.
 * @returns The determined bucket number.
 */
function bucket(key: string, buckets: number = 2) {
  const hashNum = xxHash32(key);
  return hashNum % buckets;
}

/**
 * Reads the stable id from the evaluation context, or from the cookie.
 */
function getStableId(
  request: FlagsRequest | undefined,
  context: EvaluationContext,
) {
  return context?.stableId ?? request?.cookies?.get('stable-id')?.value;
}

export const showSummerBannerFlag = defineFlag({
  key: 'summer-sale',
  description: 'Shows a bright yellow banner for a 20% discount',
  defaultValue: false,
  decide(request, context: EvaluationContext) {
    const stableId = getStableId(request, context);
    if (!stableId) {
      return false;
    }
    return bucket(`summer-sale/${stableId}`) === 1;
  },
});

export const showFreeDeliveryBannerFlag = defineFlag({
  key: 'free-delivery',
  description: 'Show a black free delivery banner at the top of the page',
  defaultValue: false,
  decide(request, context: EvaluationContext) {
    const stableId = getStableId(request, context);
    if (!stableId) {
      return false;
    }
    return bucket(`free-delivery/${stableId}`) === 1;
  },
});

const proceedToCheckoutColors = ['blue', 'green', 'red'] as const;

export const proceedToCheckoutColorFlag = defineFlag({
  key: 'proceed-to-checkout-color',
  type: 'string',
  description: 'The color of the proceed to checkout button',
  defaultValue: 'blue',
  options: proceedToCheckoutColors,
  decide(request, context: EvaluationContext) {
    const stableId = getStableId(request, context);
    if (!stableId) {
      return 'blue';
    }
    return proceedToCheckoutColors[
      bucket(
        `proceed-to-checkout-color/${stableId}`,
        proceedToCheckoutColors.length,
      )
    ];
  },
});

export const delayFlag = defineFlag({
  key: 'delay',
  type: 'number',
  defaultValue: 0,
  description:
    'A flag for debugging and demo purposes which delays the data loading',
  options: [
    { value: 0, label: 'No delay' },
    { value: 200, label: '200ms' },
    { value: 1000, label: '1s' },
    { value: 3000, label: '3s' },
    { value: 10_000, label: '10s' },
  ],
  decide() {
    return 0;
  },
});

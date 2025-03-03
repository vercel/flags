import { flag } from 'flags/next';
import { identify, type EvaluationContext } from './lib/identify';
import { xxHash32 } from 'js-xxhash';

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

export const showSummerBannerFlag = flag<boolean, EvaluationContext>({
  key: 'summer-sale',
  description: 'Shows a bright yellow banner for a 20% discount',
  defaultValue: false,
  identify,
  decide({ entities }) {
    if (!entities || !entities.stableId) return this.defaultValue!;
    return bucket(`${this.key}/${entities.stableId}`) === 1;
  },
});

export const showFreeDeliveryBannerFlag = flag<boolean, EvaluationContext>({
  key: 'free-delivery',
  description: 'Show a black free delivery banner at the top of the page',
  defaultValue: false,
  identify,
  decide({ entities }) {
    if (!entities || !entities.stableId) return this.defaultValue!;
    return bucket(`${this.key}/${entities.stableId}`) === 1;
  },
});

export const proceedToCheckoutColorFlag = flag<string, EvaluationContext>({
  key: 'proceed-to-checkout-color',
  description: 'The color of the proceed to checkout button',
  defaultValue: 'blue',
  options: ['blue', 'green', 'red'],
  identify,
  decide({ entities }) {
    if (!entities || !entities.stableId) {
      return this.defaultValue as string;
    }
    return this.options![
      bucket(`${this.key}/${entities.stableId}`, this.options!.length)
    ] as string;
  },
});

export const delayFlag = flag<number>({
  key: 'delay',
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
    return this.defaultValue!;
  },
});

export const productFlags = [
  showFreeDeliveryBannerFlag,
  showSummerBannerFlag,
] as const;

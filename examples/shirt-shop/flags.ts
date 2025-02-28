import { flag } from 'flags/next';
import { identify, type EvaluationContext } from './utils/identify';
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
  key: 'summer_sale',
  defaultValue: false,
  identify,
  decide({ entities }) {
    if (!entities || !entities.stableId) return this.defaultValue!;
    return bucket(`${this.key}/${entities.stableId}`) === 1;
  },
});

export const showFreeDeliveryBannerFlag = flag<boolean, EvaluationContext>({
  key: 'free_delivery',
  defaultValue: false,
  identify,
  decide({ entities }) {
    if (!entities || !entities.stableId) return this.defaultValue!;
    return bucket(`${this.key}/${entities.stableId}`) === 1;
  },
});

export const productFlags = [
  showFreeDeliveryBannerFlag,
  showSummerBannerFlag,
] as const;

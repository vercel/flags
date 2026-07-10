import { precompute } from 'flags/tanstack-start';
import { firstMarketingABTest, secondMarketingABTest } from './flags';

/**
 * The flags that are precomputed for the marketing pages. The order matters:
 * the same array must be passed to `precompute()` and when reading values back
 * with `flag(code, marketingFlags)`.
 */
export const marketingFlags = [
  firstMarketingABTest,
  secondMarketingABTest,
] as const;

/**
 * Precompute the marketing flags into a short, signed code that can be used as
 * a route parameter (`/marketing/$code`).
 */
export async function precomputeMarketing(request: Request): Promise<string> {
  return precompute(marketingFlags, request);
}

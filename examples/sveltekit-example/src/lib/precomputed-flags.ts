import { precompute } from 'flags/sveltekit';
import { firstMarketingABTest, secondMarketingABTest } from './flags';

export const marketingFlags = [firstMarketingABTest, secondMarketingABTest];

/**
 * Given a user-visible pathname, precompute the internal route using the flags used on that page
 *
 * e.g. /marketing -> /marketing/asd-qwe-123
 */
export async function computeInternalRoute(pathname: string, request: Request) {
	if (pathname === '/examples/marketing-pages') {
		return '/examples/marketing-pages/' + (await precompute(marketingFlags, request));
	}

	return pathname;
}

export function createVisitorId() {
	return crypto.randomUUID().replace(/-/g, '');
}

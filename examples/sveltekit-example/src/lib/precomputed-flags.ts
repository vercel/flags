import { precompute } from 'flags/sveltekit';
import { examplePrecomputed } from './flags';
import { randomUUID } from 'crypto';

export const marketingFlags = [examplePrecomputed];

/**
 * Given a user-visible pathname, precompute the internal route using the flags used on that page
 *
 * e.g. /marketing -> /marketing/asd-qwe-123
 */
export async function computeInternalRoute(pathname: string, request: Request) {
	if (pathname === '/marketing') {
		return '/marketing/' + (await precompute(marketingFlags, request));
	}

	return pathname;
}

export function createVisitorId() {
	return randomUUID().replace(/-/g, '');
}

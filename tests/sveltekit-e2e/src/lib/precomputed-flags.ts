import { precompute } from 'flags/sveltekit';
import { precomputedFlag } from './flags';

export const precomputedFlags = [precomputedFlag];

/**
 * Given a user-visible pathname, precompute the internal route using the flags used on that page
 *
 * e.g. /precomputed -> /precomputed/asd-qwe-123
 */
export async function computeInternalRoute(pathname: string, request: Request) {
	if (pathname === '/precomputed') {
		return '/precomputed/' + (await precompute(precomputedFlags, request));
	}

	return pathname;
}

export function createVisitorId() {
	return 'visitorId';
}

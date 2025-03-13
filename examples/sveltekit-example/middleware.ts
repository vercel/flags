import { rewrite } from '@vercel/edge';
import { parse } from 'cookie';
import { normalizeUrl } from '@sveltejs/kit';
import { computeInternalRoute, createVisitorId } from './src/lib/precomputed-flags';
import { marketingABTestManualApproach } from './src/lib/flags';

export const config = {
	// Either run middleware on all but the internal asset paths ...
	// matcher: '/((?!_app/|favicon.ico|favicon.png).*)'
	// ... or only run it where you actually need it (more performant).
	matcher: [
		'/examples/marketing-pages-manual-approach',
		'/examples/marketing-pages'
		// add more paths here if you want to run A/B tests on other pages, e.g.
		// '/something-else'
	]
};

export default async function middleware(request: Request) {
	const { url, denormalize } = normalizeUrl(request.url);

	if (url.pathname === '/examples/marketing-pages-manual-approach') {
		// Retrieve cookies which contain the feature flags.
		let flag = parse(request.headers.get('cookie') ?? '').marketingManual || '';

		if (!flag) {
			flag = String(Math.random() < 0.5);
			request.headers.set('x-marketingManual', flag); // cookie is not available on the initial request
		}

		return rewrite(
			// Get destination URL based on the feature flag
			denormalize(
				(await marketingABTestManualApproach(request))
					? '/examples/marketing-pages-variant-a'
					: '/examples/marketing-pages-variant-b'
			),
			{
				headers: {
					'Set-Cookie': `marketingManual=${flag}; Path=/`
				}
			}
		);
	}

	if (url.pathname === '/examples/marketing-pages') {
		// Retrieve cookies which contain the feature flags.
		let visitorId = parse(request.headers.get('cookie') ?? '').visitorId || '';

		if (!visitorId) {
			visitorId = createVisitorId();
			request.headers.set('x-visitorId', visitorId); // cookie is not available on the initial request
		}

		return rewrite(
			// Get destination URL based on the feature flag
			denormalize(await computeInternalRoute(url.pathname, request)),
			{
				headers: {
					'Set-Cookie': `visitorId=${visitorId}; Path=/`
				}
			}
		);
	}
}

import { next, rewrite } from '@vercel/edge';
import { parse } from 'cookie';
import { normalizeUrl } from '@sveltejs/kit';
import { computeInternalRoute, createVisitorId } from './src/lib/precomputed-flags';

export const config = {
	// Either run middleware on all but the internal asset paths ...
	// matcher: '/((?!_app/|favicon.ico|favicon.png).*)'
	// ... or only run it where you actually need it (more performant).
	matcher: [
		'/examples/marketing-pages'
		// add more paths here if you want to run A/B tests on other pages, e.g.
		// '/something-else'
	]
};

export default async function middleware(request: Request) {
	const { url, denormalize } = normalizeUrl(request.url);

	// this part is only needed if you use the commented-out matcher above instead
	// if (url.pathname !== '/examples/marketing-pages') return next();

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

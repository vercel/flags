import { text } from '@sveltejs/kit';
import { computeInternalRoute, createVisitorId } from '$lib/precomputed-flags';

export async function GET({ url, request, cookies, setHeaders }) {
	let visitorId = cookies.get('visitorId');

	if (!visitorId) {
		visitorId = createVisitorId();
		cookies.set('visitorId', visitorId, {
			path: '/',
			httpOnly: false // So that we can reset the visitor Id on the client in the examples
		});
		request.headers.set('x-visitorId', visitorId); // cookie is not available on the initial request
	}

	// Add cache headers to not request the API as much (as the visitor id is not changing)
	setHeaders({ 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' });

	return text(await computeInternalRoute(url.searchParams.get('pathname')!, request));
}

import { text } from '@sveltejs/kit';
import { computeInternalRoute, createVisitorId } from '$lib/precomputed-flags';

export async function GET({ url, request, cookies }) {
	let visitorId = cookies.get('visitorId');

	if (!visitorId) {
		visitorId = createVisitorId();
		cookies.set('visitorId', visitorId, { path: '/' });
		request.headers.set('x-visitorId', visitorId); // cookie is not available on the initial request
	}

	return text(await computeInternalRoute(url.searchParams.get('pathname')!, request));
}

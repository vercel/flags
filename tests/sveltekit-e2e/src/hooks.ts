export async function reroute({ url, fetch }) {
	if (url.pathname === '/precomputed') {
		const destination = new URL('/api/reroute', url);
		destination.searchParams.set('pathname', url.pathname);

		return fetch(destination).then((response) => response.text());
	}
}

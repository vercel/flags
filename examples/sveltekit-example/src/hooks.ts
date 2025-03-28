// `reroute` is called on both the server and client during dev, because `middleware.ts` is unknown to SvelteKit.
// In production it's called on the client only because `middleware.ts` will handle the first page visit.
// As a result, when visiting a page you'll get rerouted accordingly in all situations in both dev and prod.
export async function reroute({ url, fetch }) {
	if (url.pathname === '/examples/marketing-pages-manual-approach') {
		const destination = new URL('/api/reroute-manual', url);

		// Since `reroute` runs on the client and the cookie with the flag info is not available to it,
		// we do a server request to get the internal route.
		return fetch(destination).then((response) => response.text());
	}

	if (
		url.pathname === '/examples/marketing-pages'
		// add more paths here if you want to run A/B tests on other pages, e.g.
		// || url.pathname === '/something-else'
	) {
		const destination = new URL('/api/reroute', url);
		destination.searchParams.set('pathname', url.pathname);

		// Since `reroute` runs on the client and the cookie with the flag info is not available to it,
		// we do a server request to get the internal route.
		return fetch(destination).then((response) => response.text());
	}
}

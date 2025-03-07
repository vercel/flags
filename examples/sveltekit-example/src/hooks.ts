// `reroute` is called on both the server and client during dev, because `middleware.ts` is unknown to SvelteKit.
// In production, for the `/` route it's called on the client only because `middleware.ts` will handle the first page visit.
// As a result, when visiting `/` you'll get rerouted accordingly on both dev and prod.
export async function reroute({ url, fetch }) {
	if (
		url.pathname === '/marketing'
		// add more paths here if you want to run A/B tests on other pages, e.g.
		// || url.pathname === '/something-else'
	) {
		const destination = new URL('/api/reroute', url);
		destination.searchParams.set('pathname', url.pathname);

		return fetch(destination).then((response) => response.text());
	}
}

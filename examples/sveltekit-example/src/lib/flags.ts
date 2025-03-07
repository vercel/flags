import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { flag } from 'flags/sveltekit';

export const showDashboard = flag<boolean>({
	key: 'showDashboard',
	description: 'Show the dashboard', // optional
	origin: 'https://example.com/#showdashbord', // optional
	options: [{ value: true }, { value: false }], // optional
	// can be async and has access to the event
	decide(_event) {
		return false;
	}
});

interface Entities {
	visitorId?: string;
}

function identify({
	cookies,
	headers
}: {
	cookies: ReadonlyRequestCookies;
	headers: ReadonlyHeaders;
}): Entities {
	const visitorId = cookies.get('visitorId')?.value ?? headers.get('x-visitorId');

	if (!visitorId) {
		throw new Error(
			'Visitor ID not found - should have been set by middleware or within api/reroute'
		);
	}

	return { visitorId };
}

export const examplePrecomputed = flag<boolean, Entities>({
	key: 'examplePrecomputed',
	description: 'Example of a precomputed flag',
	identify,
	decide({ entities }) {
		if (!entities?.visitorId) return false;

		// Use any kind of deterministic method that runs on the visitorId
		return /^[a-n0-5]/i.test(entities?.visitorId);
	}
});

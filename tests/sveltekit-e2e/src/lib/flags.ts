import { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { flag } from 'flags/sveltekit';

export const showDashboard = flag<boolean>({
	key: 'showDashboard',
	description: 'Show the dashboard', // optional
	origin: 'https://example.com/#showdashbord', // optional
	options: [{ value: true }, { value: false }], // optional
	// can be async and has access to the event
	decide(_event) {
		return true;
	}
});

export const hostFlag = flag<string>({
	key: 'host',
	decide: ({ headers }) => headers.get('host') || 'no host'
});

export const cookieFlag = flag<string>({
	key: 'cookie',
	decide: ({ cookies }) => cookies.get('example-cookie')?.value || 'no cookie'
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

export const precomputedFlag = flag<string, Entities>({
	key: 'precomputedFlag',
	description: 'A precomputed flag',
	identify,
	decide({ entities, cookies, headers }) {
		if (!entities?.visitorId) return 'fail';

		return (
			entities.visitorId +
			'|' +
			(cookies.get('visitorId')?.value || 'no cookie') +
			'|' +
			(headers.get('x-visitorId') || 'no header')
		);
	}
});

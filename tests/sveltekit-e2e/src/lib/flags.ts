import { flag } from '@vercel/flags/sveltekit';

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

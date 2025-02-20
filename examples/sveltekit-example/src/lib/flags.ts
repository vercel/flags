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

import type { PageServerLoad } from './$types';
import { cookieFlag, hostFlag, showDashboard } from '$lib/flags';

export const load: PageServerLoad = async () => {
	const dashboard = await showDashboard();
	const host = await hostFlag();
	const cookie = await cookieFlag();

	return {
		post: {
			title: dashboard ? 'New Dashboard' : `Old Dashboard`,
			content: `Content for page goes here`
		},
		dashboard,
		host,
		cookie
	};
};

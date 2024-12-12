import type { PageServerLoad } from './$types';
import { showDashboard } from '$lib/flags';

export const load: PageServerLoad = async () => {
	const dashboard = await showDashboard();

	return {
		post: {
			title: dashboard ? 'New Dashboard' : `Old Dashboard`,
			content: `Content for page goes here`
		}
	};
};

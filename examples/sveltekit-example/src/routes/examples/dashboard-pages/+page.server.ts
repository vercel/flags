import type { PageServerLoad } from './$types';
import { showNewDashboard } from '$lib/flags';

export const load: PageServerLoad = async () => {
	const dashboard = await showNewDashboard();

	return {
		title: dashboard ? 'New Dashboard' : `Old Dashboard`
	};
};

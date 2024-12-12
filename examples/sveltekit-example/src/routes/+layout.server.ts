import type { LayoutServerLoad } from './$types';
import { showDashboard } from '$lib/flags';

export const load: LayoutServerLoad = async () => {
	const dashboard = await showDashboard();
	return { title: dashboard ? 'new dashboard' : 'old dashboard' };
};

import type { PageServerLoad } from './$types';
import { precomputedFlag } from '$lib/flags';
import { precomputedFlags } from '$lib/precomputed-flags';

export const prerender = true;

export const load: PageServerLoad = async ({ params }) => {
	return {
		flag: await precomputedFlag(params.code, precomputedFlags)
	};
};

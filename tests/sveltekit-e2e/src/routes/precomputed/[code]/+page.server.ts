import type { PageServerLoad } from './$types';
import { precomputedFlag } from '$lib/flags';
import { precomputedFlags } from '$lib/precomputed-flags';
import { generatePermutations } from 'flags/sveltekit';

export const prerender = true;

export async function entries() {
	return (await generatePermutations(precomputedFlags)).map((code) => ({ code }));
}

export const load: PageServerLoad = async ({ params }) => {
	return {
		flag: await precomputedFlag(params.code, precomputedFlags)
	};
};

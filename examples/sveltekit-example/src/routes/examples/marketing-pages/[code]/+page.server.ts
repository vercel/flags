import type { PageServerLoad } from './$types';
import { firstMarketingABTest, secondMarketingABTest } from '$lib/flags';
import { marketingFlags } from '$lib/precomputed-flags';
import { generatePermutations } from 'flags/sveltekit';

// Use Vercel ISR:
export const config = {
	isr: {
		expiration: false
	}
};

// You could also prerender at build time by doing:
//
// export const prerender = true;
//
// export async function entries() {
// 	return (await generatePermutations(marketingFlags)).map((code) => ({ code }));
// }

export const load: PageServerLoad = async ({ params }) => {
	const flag1 = await firstMarketingABTest(params.code, marketingFlags);
	const flag2 = await secondMarketingABTest(params.code, marketingFlags);

	return {
		first: `First flag evaluated to ${flag1}`,
		second: `Second flag evaluated to ${flag2}`
	};
};

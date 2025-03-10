import type { PageServerLoad } from './$types';
import { examplePrecomputed } from '$lib/flags';
import { marketingFlags } from '$lib/precomputed-flags';
import { generatePermutations } from 'flags/sveltekit';

export const prerender = true;

export async function entries() {
	return (await generatePermutations(marketingFlags)).map((code) => ({ code }));
}

// On Vercel you could also use ISR:
// export const config= {
// 	isr: {
// 		expiration: 60
// 	}
// };

export const load: PageServerLoad = async ({ params }) => {
	const flag = await examplePrecomputed(params.code, marketingFlags);

	return {
		post: {
			title: flag ? 'New Marketing Page' : `Old Marketing Page`,
			content: `Content for page goes here`
		}
	};
};

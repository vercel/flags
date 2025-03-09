import type { PageServerLoad } from './$types';
import { examplePrecomputed } from '$lib/flags';
import { marketingFlags } from '$lib/precomputed-flags';

export const prerender = true;

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

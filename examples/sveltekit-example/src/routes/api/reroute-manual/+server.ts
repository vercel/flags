import { marketingABTestManualApproach } from '$lib/flags.js';
import { text } from '@sveltejs/kit';

export async function GET({ request, cookies }) {
	let flag = cookies.get('marketingManual');

	if (!flag) {
		flag = String(Math.random() < 0.5);
		cookies.set('marketingManual', flag, {
			path: '/',
			httpOnly: false // So that we can reset the visitor Id on the client in the examples
		});
		request.headers.set('x-marketingManual', flag); // cookie is not available on the initial request
	}

	return text(
		(await marketingABTestManualApproach())
			? '/examples/marketing-pages-variant-a'
			: '/examples/marketing-pages-variant-b'
	);
}

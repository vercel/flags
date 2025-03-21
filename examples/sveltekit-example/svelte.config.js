import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// You can switch out the Vercel adapter with another one, though keep in mind that the precompute
		// approach needs another approach then, as middleware.ts is Vercel concept.
		adapter: adapter()
	}
};

export default config;

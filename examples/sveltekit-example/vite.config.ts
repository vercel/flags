import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { vercelToolbar } from '@vercel/toolbar/plugins/vite';

export default defineConfig({
	plugins: [sveltekit(), vercelToolbar()]
});

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { vercelToolbar } from '@vercel/toolbar/plugins/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [sveltekit(), vercelToolbar(), tailwindcss()]
});

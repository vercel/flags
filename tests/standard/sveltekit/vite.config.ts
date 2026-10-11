import { sveltekit } from '@sveltejs/kit/vite';
import { flags } from 'flags/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit(), flags()],
});

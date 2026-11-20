import { flags } from '@flags-sdk/sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // The plugin writes .flags/self.ts from src/flags/sources/self, and points
  // flags:self to it
  plugins: [sveltekit(), flags()],
});

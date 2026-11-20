import { flags } from '@flags-sdk/sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // codeGeneration writes .flags/self.ts from flags/sources/self, and points
  // flags:self to it
  plugins: [sveltekit(), flags({ codeGeneration: true })],
});

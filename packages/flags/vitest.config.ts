import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The SDK imports its default provider through its own package name
      'flags/default-provider': fileURLToPath(
        new URL('./src/default-provider.ts', import.meta.url),
      ),
      'flags/framework': fileURLToPath(
        new URL('./src/framework.ts', import.meta.url),
      ),
      'flags/config': fileURLToPath(
        new URL('./src/config-module.ts', import.meta.url),
      ),
      // Modules of SvelteKit and Nitro, which only the frameworks provide
      '$app/server': fileURLToPath(
        new URL('./test/stubs/app-server.ts', import.meta.url),
      ),
      '#imports': fileURLToPath(
        new URL('./test/stubs/nitro-imports.ts', import.meta.url),
      ),
      'flags:tanstack-start/server': fileURLToPath(
        new URL('./test/stubs/tanstack-start-server.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
  },
});

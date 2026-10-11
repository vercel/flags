import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'flags:tanstack-start/server': fileURLToPath(
        new URL('./test/stubs/tanstack-start-server.ts', import.meta.url),
      ),
      'flags:tanstack-start/router': fileURLToPath(
        new URL('./test/stubs/tanstack-start-router.ts', import.meta.url),
      ),
    },
  },
  test: { environment: 'node' },
});

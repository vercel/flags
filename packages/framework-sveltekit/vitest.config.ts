import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '$app/server': fileURLToPath(
        new URL('./test/stubs/app-server.ts', import.meta.url),
      ),
    },
  },
  test: { environment: 'node' },
});

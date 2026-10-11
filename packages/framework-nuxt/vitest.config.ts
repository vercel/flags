import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#imports': fileURLToPath(
        new URL('./test/stubs/nitro-imports.ts', import.meta.url),
      ),
    },
  },
  test: { environment: 'node' },
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The replaceable module, from the source instead of the build
      '@flags-sdk/next/encrypt-values': fileURLToPath(
        new URL('./src/encrypt-values.ts', import.meta.url),
      ),
    },
  },
  test: { environment: 'node' },
});

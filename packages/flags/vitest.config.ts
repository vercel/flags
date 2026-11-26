import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // As withFlags does in an application: the tests get the request from
      // next/headers, which they mock
      {
        find: /^flags\/framework$/,
        replacement: fileURLToPath(
          new URL('./test/next-binding.ts', import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: 'node',
  },
});

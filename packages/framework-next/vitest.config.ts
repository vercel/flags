import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      // What withFlags does in an application: flags gets the request from
      // the binding of Next.js
      {
        find: /^flags\/framework$/,
        replacement: fileURLToPath(
          new URL('./src/binding.ts', import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: 'node',
    // flags must go through Vite, so that the alias applies to it
    server: { deps: { inline: ['flags'] } },
  },
});

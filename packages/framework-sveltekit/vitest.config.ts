import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^\$app\/server$/,
        replacement: fileURLToPath(
          new URL('./test/stubs/app-server.ts', import.meta.url),
        ),
      },
      // What flags() does in an application: flags gets the request from
      // the binding of SvelteKit
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

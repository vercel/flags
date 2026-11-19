import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      // The SDK imports its default provider through its own package name
      {
        find: 'flags/default-provider',
        replacement: fileURLToPath(
          new URL('./src/default-provider.ts', import.meta.url),
        ),
      },
      {
        find: 'flags/framework',
        replacement: fileURLToPath(
          new URL('./src/framework.ts', import.meta.url),
        ),
      },
      {
        find: 'flags/config',
        replacement: fileURLToPath(
          new URL('./src/config-module.ts', import.meta.url),
        ),
      },
      // Generated modules of flags:<source> import the SDK by its name
      {
        find: /^flags$/,
        replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
  },
});

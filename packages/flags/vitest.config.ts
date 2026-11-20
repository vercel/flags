import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
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
      {
        find: 'flags/hooks',
        replacement: fileURLToPath(
          new URL('./src/hooks-module.ts', import.meta.url),
        ),
      },
      {
        find: 'flags/overrides',
        replacement: fileURLToPath(
          new URL('./src/overrides-module.ts', import.meta.url),
        ),
      },
      {
        find: 'flags/settings',
        replacement: fileURLToPath(
          new URL('./src/settings-module.ts', import.meta.url),
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

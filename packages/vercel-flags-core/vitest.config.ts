import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    server: {
      deps: {
        inline: ['@vercel/flags'],
      },
    },
    env: loadEnv(mode, process.cwd(), ''),
  },
}));

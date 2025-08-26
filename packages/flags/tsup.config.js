import { defineConfig } from 'tsup';

const defaultConfig = {
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  minify: false,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: [/^node:.*/, 'node_modules'],
};

// eslint-disable-next-line import/no-default-export -- [@vercel/style-guide@5 migration]
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    next: 'src/next/index.ts',
    nuxt: 'src/nuxt/module.ts',
    'nuxt/runtime/index': 'src/nuxt/runtime/index.ts',
    'nuxt/runtime/app/plugin.server': 'src/nuxt/runtime/app/plugin.server.ts',
    'nuxt/runtime/server/flags': 'src/nuxt/runtime/server/flags.ts',
    sveltekit: 'src/sveltekit/index.ts',
    react: 'src/react/index.tsx',
    analytics: 'src/analytics.ts',
  },
  ...defaultConfig,
});

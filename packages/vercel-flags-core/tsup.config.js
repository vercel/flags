import { defineConfig } from 'tsup';

export default [
  // default bundle (non-Next.js)
  defineConfig({
    entry: {
      index: 'src/index.ts',
      openfeature: 'src/openfeature.ts',
    },
    format: ['esm', 'cjs'],
    splitting: true,
    sourcemap: true,
    minify: false,
    clean: true,
    skipNodeModulesBundle: true,
    dts: true,
    external: [
      'node_modules',
      '@vercel/flags-definitions',
      '@vercel/flags-definitions/definitions.json',
    ],
  }),
  // next-js bundle
  defineConfig({
    entry: {
      'index.next-js': 'src/index.ts',
      'openfeature.next-js': 'src/openfeature.ts',
    },
    format: ['esm', 'cjs'],
    splitting: true,
    sourcemap: true,
    minify: false,
    clean: true,
    skipNodeModulesBundle: true,
    dts: false,
    external: [
      'node_modules',
      '@vercel/flags-definitions',
      '@vercel/flags-definitions/definitions.json',
    ],
    esbuildOptions(options) {
      options.conditions = ['next-js'];
    },
  }),
  // cli
  defineConfig({
    entry: ['src/cli.ts'],
    format: 'esm',
    splitting: true,
    sourcemap: true,
    minify: false,
    clean: true,
    skipNodeModulesBundle: true,
    dts: true,
    external: ['node_modules'],
  }),
];

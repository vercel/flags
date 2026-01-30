import { defineConfig } from 'tsup';

export default [
  defineConfig({
    entry: ['src/index.default.ts', 'src/openfeature.default.ts'],
    format: 'esm',
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
  // Next.js-specific entry point (separate config to avoid split types)
  defineConfig({
    entry: ['src/index.next-js.ts', 'src/openfeature.next-js.ts'],
    format: 'esm',
    splitting: true,
    sourcemap: true,
    minify: false,
    clean: false,
    skipNodeModulesBundle: true,
    dts: true,
    external: [
      'node_modules',
      '@vercel/flags-definitions',
      '@vercel/flags-definitions/definitions.json',
    ],
  }),
  // cli
  defineConfig({
    entry: ['src/cli.ts'],
    format: 'esm',
    splitting: true,
    sourcemap: true,
    minify: false,
    clean: false,
    skipNodeModulesBundle: true,
    dts: true,
    external: ['node_modules'],
  }),
];

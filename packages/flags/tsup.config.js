import { defineConfig } from 'tsup';

/**
 * Keeps the imports of `flags/framework`, which the build plugin of a
 * framework replaces with a bundler alias. tsconfig.json maps it to the
 * source for the type check, and esbuild would follow that mapping and
 * bundle it. A bundler alias of the application can only replace an import
 * which is still there.
 */
const keepFrameworkImport = {
  name: 'keep-framework-import',
  setup(build) {
    build.onResolve({ filter: /^flags\/framework$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

const defaultConfig = {
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  minify: false,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: [/^node:.*/, 'node_modules'],
  esbuildPlugins: [keepFrameworkImport],
};

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    // A separate entry, so that a bundler can replace it with an alias
    framework: 'src/framework-module.ts',
    react: 'src/react/index.tsx',
    analytics: 'src/analytics.ts',
  },
  ...defaultConfig,
});

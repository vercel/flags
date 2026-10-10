import { defineConfig } from 'tsup';

/**
 * Keeps the import of `flags/default-provider` as it is. tsconfig.json maps
 * it to the source for the type check, and esbuild would follow that mapping
 * and bundle the module. A bundler alias of the application can only
 * replace an import which is still there.
 */
const keepDefaultProviderImport = {
  name: 'keep-default-provider-import',
  setup(build) {
    build.onResolve({ filter: /^flags\/default-provider$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    // A separate entry, so that a bundler can replace it with an alias
    'default-provider': 'src/default-provider.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  minify: false,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: [/^node:.*/, 'node_modules'],
  esbuildPlugins: [keepDefaultProviderImport],
  removeNodeProtocol: false,
});

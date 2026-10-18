import { defineConfig } from 'tsup';

/**
 * Keeps the import of the module which withFlags can replace with an alias.
 * tsconfig.json maps it to the source for the type check, and esbuild would
 * follow that mapping and bundle it.
 */
const keepReplaceableImports = {
  name: 'keep-replaceable-imports',
  setup(build) {
    build.onResolve(
      { filter: /^@flags-sdk\/next\/encrypt-values$/ },
      (args) => ({
        path: args.path,
        external: true,
      }),
    );
  },
};

export default defineConfig({
  entry: {
    binding: 'src/binding.ts',
    plugin: 'src/plugin.ts',
    precompute: 'src/precompute.ts',
    'flag-values': 'src/flag-values.ts',
    // Separate entries, so that withFlags can replace one with the other
    'encrypt-values': 'src/encrypt-values.ts',
    'encrypt-values-cached': 'src/encrypt-values-cached.ts',
    manifest: 'src/manifest.ts',
    'use-flags-loader': 'src/use-flags-loader.ts',
    'manifest-loader': 'src/manifest-loader.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: [/^node:.*/],
  esbuildPlugins: [keepReplaceableImports],
});

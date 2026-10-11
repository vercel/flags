import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    binding: 'src/binding.ts',
    plugin: 'src/plugin.ts',
    precompute: 'src/precompute.ts',
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
});

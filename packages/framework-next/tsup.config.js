import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    binding: 'src/binding.ts',
    manifest: 'src/manifest.ts',
    'manifest-loader': 'src/manifest-loader.ts',
    plugin: 'src/plugin.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: [/^node:.*/],
});

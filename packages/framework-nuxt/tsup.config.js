import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    binding: 'src/binding.ts',
    plugin: 'src/plugin.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  // import.meta.url in the CommonJS build
  shims: true,
  external: [/^node:.*/, /^#imports$/],
});
